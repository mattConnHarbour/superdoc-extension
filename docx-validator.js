import { Schema } from 'prosemirror-model';
import JSZip from 'jszip';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const documentSchema = new Schema({
  nodes: {
    doc: {
      content: "block+"
    },
    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }, { tag: "div" }],
      toDOM() { return ["p", 0]; },
      attrs: {
        textAlign: { default: null },
        marginTop: { default: null },
        marginBottom: { default: null },
        marginLeft: { default: null },
        marginRight: { default: null }
      },
      defining: false,
      draggable: false
    },
    text: {
      group: "inline"
    },
    hard_break: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM() { return ["br"]; },
      leafText() { return "\n"; }
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: "inline*",
      group: "block",
      defining: true,
      parseDOM: [
        { tag: "h1", attrs: { level: 1 } },
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
        { tag: "h4", attrs: { level: 4 } },
        { tag: "h5", attrs: { level: 5 } },
        { tag: "h6", attrs: { level: 6 } }
      ],
      toDOM(node) { return ["h" + node.attrs.level, 0]; }
    },
    blockquote: {
      content: "block+",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "blockquote" }],
      toDOM() { return ["blockquote", 0]; }
    },
    ordered_list: {
      content: "list_item+",
      group: "block",
      attrs: { order: { default: 1 } },
      parseDOM: [{ tag: "ol", getAttrs(dom) { return { order: dom.hasAttribute("start") ? +dom.getAttribute("start") : 1 }; } }],
      toDOM(node) { return node.attrs.order == 1 ? ["ol", 0] : ["ol", { start: node.attrs.order }, 0]; }
    },
    bullet_list: {
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM() { return ["ul", 0]; }
    },
    list_item: {
      content: "paragraph block*",
      parseDOM: [{ tag: "li" }],
      toDOM() { return ["li", 0]; },
      defining: true
    },
    table: {
      content: "table_row+",
      group: "block",
      parseDOM: [{ tag: "table" }],
      toDOM() { return ["table", 0]; }
    },
    table_row: {
      content: "table_cell+",
      parseDOM: [{ tag: "tr" }],
      toDOM() { return ["tr", 0]; }
    },
    table_cell: {
      content: "block+",
      attrs: { colspan: { default: 1 }, rowspan: { default: 1 } },
      parseDOM: [{ tag: "td", getAttrs(dom) { return { colspan: +dom.getAttribute("colspan") || 1, rowspan: +dom.getAttribute("rowspan") || 1 }; } }],
      toDOM(node) { return ["td", node.attrs, 0]; }
    }
  },
  marks: {
    strong: {
      parseDOM: [{ tag: "strong" }, { tag: "b", getAttrs: node => node.style.fontWeight != "normal" && null }],
      toDOM() { return ["strong", 0]; }
    },
    em: {
      parseDOM: [{ tag: "i" }, { tag: "em" }],
      toDOM() { return ["em", 0]; }
    },
    underline: {
      parseDOM: [{ tag: "u" }],
      toDOM() { return ["u", 0]; }
    },
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [{ tag: "a[href]", getAttrs(dom) { return { href: dom.getAttribute("href"), title: dom.getAttribute("title") }; } }],
      toDOM(node) { let { href, title } = node.attrs; return ["a", { href, title }, 0]; }
    }
  }
});


function validateAndCorrectDocx(docxBlob) {
  return new Promise(async (resolve, reject) => {
    try {
      const zip = new JSZip();
      const docxContent = await zip.loadAsync(docxBlob);
      
      const documentXml = await docxContent.file("word/document.xml").async("text");
      const stylesXml = await docxContent.file("word/styles.xml")?.async("text") || "";
      
      const correctedDocumentXml = validateAndCorrectStructure(documentXml);
      const correctedStyles = validateAndCorrectStyles(stylesXml);
      
      docxContent.file("word/document.xml", correctedDocumentXml);
      docxContent.file("word/styles.xml", correctedStyles);
      
      const correctedBlob = await docxContent.generateAsync({ type: "blob" });
      resolve(correctedBlob);
      
    } catch (error) {
      reject(error);
    }
  });
}

function validateAndCorrectStructure(documentXml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTrueNumberOnly: false,
    preserveOrder: false,
    trimValues: false
  });
  
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    preserveOrder: false,
    suppressEmptyNode: false
  });
  
  try {
    const doc = parser.parse(documentXml);
    
    if (!doc["w:document"] || !doc["w:document"]["w:body"]) {
      return documentXml;
    }
    
    const body = doc["w:document"]["w:body"];
    
    // Only add missing elements, don't modify existing structure
    if (!body["w:p"] && !body["w:tbl"] && !body["w:sectPr"]) {
      // Only if completely empty, add a paragraph with proper structure
      body["w:p"] = [{ 
        "w:pPr": {},
        "w:r": [{ "w:t": "" }] 
      }];
    }
    
    // Ensure paragraphs have minimum required structure only if they're broken
    if (body["w:p"]) {
      if (!Array.isArray(body["w:p"])) {
        body["w:p"] = [body["w:p"]];
      }
      
      body["w:p"].forEach(paragraph => {
        // Ensure paragraph properties exist for proper formatting
        if (paragraph && typeof paragraph === 'object') {
          if (!paragraph["w:pPr"]) {
            paragraph["w:pPr"] = {};
          }
          
          // Only fix completely broken paragraphs (no content at all)
          if (!paragraph["w:r"] && !paragraph["w:hyperlink"] && !paragraph["w:fldSimple"] && 
              !paragraph["w:bookmarkStart"] && !paragraph["w:bookmarkEnd"]) {
            paragraph["w:r"] = [{ "w:t": "" }];
          }
        }
      });
    }
    
    // Ensure page margins and size
    if (!body["w:sectPr"]) {
      body["w:sectPr"] = {
        "w:pgSz": {
          "@_w:w": "12240",    // 8.5 inches = 12240 twips
          "@_w:h": "15840"     // 11 inches = 15840 twips (US Letter)
        },
        "w:pgMar": {
          "@_w:top": "1440",
          "@_w:right": "1440", 
          "@_w:bottom": "1440",
          "@_w:left": "1440",
          "@_w:header": "720",
          "@_w:footer": "720",
          "@_w:gutter": "0"
        }
      };
    } else {
      const sectPr = body["w:sectPr"];
      
      // Ensure page size
      if (!sectPr["w:pgSz"]) {
        sectPr["w:pgSz"] = {
          "@_w:w": "12240",    // 8.5 inches = 12240 twips
          "@_w:h": "15840"     // 11 inches = 15840 twips (US Letter)
        };
      } else {
        const pgSz = sectPr["w:pgSz"];
        if (!pgSz["@_w:w"]) pgSz["@_w:w"] = "12240";
        if (!pgSz["@_w:h"]) pgSz["@_w:h"] = "15840";
      }
      
      // Ensure page margins
      if (!sectPr["w:pgMar"]) {
        sectPr["w:pgMar"] = {
          "@_w:top": "1440",
          "@_w:right": "1440",
          "@_w:bottom": "1440", 
          "@_w:left": "1440",
          "@_w:header": "720",
          "@_w:footer": "720",
          "@_w:gutter": "0"
        };
      } else {
        const pgMar = sectPr["w:pgMar"];
        if (!pgMar["@_w:top"]) pgMar["@_w:top"] = "1440";
        if (!pgMar["@_w:right"]) pgMar["@_w:right"] = "1440";
        if (!pgMar["@_w:bottom"]) pgMar["@_w:bottom"] = "1440";
        if (!pgMar["@_w:left"]) pgMar["@_w:left"] = "1440";
      }
    }
    
    return builder.build(doc);
    
  } catch (error) {
    console.error('Error parsing document XML:', error);
    return documentXml;
  }
}


function validateAndCorrectStyles(stylesXml) {
  if (!stylesXml) {
    return createDefaultStyles();
  }
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTrueNumberOnly: false
  });
  
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true
  });
  
  try {
    const stylesDoc = parser.parse(stylesXml);
    
    if (!stylesDoc["w:styles"]) {
      return createDefaultStyles();
    }
    
    const styles = stylesDoc["w:styles"];
    
    // Ensure styles array exists
    if (!styles["w:style"]) {
      styles["w:style"] = [];
    } else if (!Array.isArray(styles["w:style"])) {
      styles["w:style"] = [styles["w:style"]];
    }
    
    // Find Normal style
    const normalStyle = styles["w:style"].find(style => 
      style["@_w:styleId"] === "Normal"
    );
    
    if (!normalStyle) {
      // Add Normal style
      styles["w:style"].push({
        "@_w:type": "paragraph",
        "@_w:default": "1",
        "@_w:styleId": "Normal",
        "w:name": { "@_w:val": "Normal" },
        "w:qFormat": {},
        "w:pPr": {
          "w:spacing": {
            "@_w:after": "0",
            "@_w:line": "276",
            "@_w:lineRule": "auto"
          }
        },
        "w:rPr": {
          "w:rFonts": {
            "@_w:ascii": "Times New Roman",
            "@_w:eastAsia": "Times New Roman",
            "@_w:hAnsi": "Times New Roman",
            "@_w:cs": "Times New Roman"
          },
          "w:sz": { "@_w:val": "24" },
          "w:szCs": { "@_w:val": "24" }
        }
      });
    } else {
      // Ensure Normal style has required properties
      if (!normalStyle["w:rPr"]) {
        normalStyle["w:rPr"] = {};
      }
      
      if (!normalStyle["w:rPr"]["w:rFonts"]) {
        normalStyle["w:rPr"]["w:rFonts"] = {
          "@_w:ascii": "Times New Roman",
          "@_w:eastAsia": "Times New Roman",
          "@_w:hAnsi": "Times New Roman",
          "@_w:cs": "Times New Roman"
        };
      }
      
      if (!normalStyle["w:rPr"]["w:sz"]) {
        normalStyle["w:rPr"]["w:sz"] = { "@_w:val": "24" };
      }
    }
    
    return builder.build(stylesDoc);
    
  } catch (error) {
    console.error('Error parsing styles XML:', error);
    return createDefaultStyles();
  }
}

function createDefaultStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:after="0" w:line="276" w:lineRule="auto"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
</w:styles>`;
}


export { validateAndCorrectDocx, documentSchema };