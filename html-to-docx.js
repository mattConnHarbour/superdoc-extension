import JSZip from 'jszip';

// Convert HTML string to DOCX blob
export async function htmlToDocxBlob(htmlContent) {
  console.log('Starting HTML to DOCX conversion... htmlToDocxBlob', htmlContent);
  // Convert HTML to WordML (Word's XML format)
  const wordMLContent = htmlToWordML(htmlContent);
  
  // Create DOCX structure using JSZip
  const zip = new JSZip();
  
  // Add required DOCX files
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`);

  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${wordMLContent}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId2"/>
      <w:footerReference w:type="default" r:id="rId3"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`);

  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:rPr>
      <w:b/>
      <w:sz w:val="32"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:rPr>
      <w:b/>
      <w:sz w:val="28"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:rPr>
      <w:b/>
      <w:sz w:val="24"/>
    </w:rPr>
  </w:style>
</w:styles>`);

  zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t></w:t></w:r></w:p>
</w:hdr>`);

  zip.file('word/footer1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t></w:t></w:r></w:p>
</w:ftr>`);

  // Generate the DOCX blob
  const docxBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  
  return docxBlob;
}

// Convert HTML to WordML format
function htmlToWordML(html) {
  console.log('Converting HTML to WordML:', html);
  // Simple HTML to WordML conversion
  // Replace HTML tags with WordML equivalents
  html = html.replace(/<h1>(.*?)<\/h1>/g, '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>$1</w:t></w:r></w:p>');
  html = html.replace(/<h2>(.*?)<\/h2>/g, '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>$1</w:t></w:r></w:p>');
  html = html.replace(/<h3>(.*?)<\/h3>/g, '<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>$1</w:t></w:r></w:p>');
  html = html.replace(/<p>(.*?)<\/p>/g, '<w:p><w:r><w:t>$1</w:t></w:r></w:p>');
  html = html.replace(/<strong>(.*?)<\/strong>/g, '<w:r><w:rPr><w:b/></w:rPr><w:t>$1</w:t></w:r>');
  html = html.replace(/<em>(.*?)<\/em>/g, '<w:r><w:rPr><w:i/></w:rPr><w:t>$1</w:t></w:r>');
  html = html.replace(/<code>(.*?)<\/code>/g, '<w:r><w:rPr><w:rFonts w:ascii="Courier New"/></w:rPr><w:t>$1</w:t></w:r>');
  html = html.replace(/<br\s*\/?>/g, '<w:br/>');
  
  // Handle lists
  html = html.replace(/<ul>(.*?)<\/ul>/gs, (_, content) => {
    const items = content.match(/<li>(.*?)<\/li>/g) || [];
    return items.map(item => {
      const text = item.replace(/<\/?li>/g, '');
      return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
    }).join('');
  });
  
  // Clean up any remaining HTML tags
  html = html.replace(/<[^>]*>/g, '');
  
  // If no WordML was generated, create a simple paragraph
  if (!html.includes('<w:p>')) {
    html = `<w:p><w:r><w:t>${html}</w:t></w:r></w:p>`;
  }
  
  return html;
}

// Create global object for browser environment
if (typeof window !== 'undefined') {
  window.HtmlToDocx = {
    htmlToDocxBlob
  };
}