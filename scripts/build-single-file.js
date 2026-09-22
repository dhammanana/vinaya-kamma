import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const TOC_PATH = args[0] || 'html_chapters/toc.json';
const OUTPUT_HTML = args[1] || 'monastic-procedures.html';
const OUTPUT_DOCX = args[2] || 'monastic-procedures.docx';
const CHAPTERS_DIR = path.dirname(TOC_PATH);

console.log(`Using TOC: ${TOC_PATH}`);
console.log(`Output HTML: ${OUTPUT_HTML}`);
console.log(`Output DOCX: ${OUTPUT_DOCX}`);

if (!fs.existsSync(TOC_PATH)) {
    console.error(`Error: TOC file not found at ${TOC_PATH}`);
    process.exit(1);
}

function processToc(items) {
    let html = '';
    for (const item of items) {
        const hLevel = item.level || 1;
        html += `<h${hLevel} style="margin-top: 20pt; margin-bottom: 10pt;">${item.label}</h${hLevel}>\n`;
        
        if (item.file) {
            const filePath = path.join(CHAPTERS_DIR, item.file);
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const $ = cheerio.load(fileContent);
                
                const content = $('.content');
                
                // Remove navigation/subtopics
                content.find('.subtopics').remove();
                content.find('.heading-bar').remove(); // Some chapters might have it inside content if not careful
                
                // Process largefont (Recitation Box)
                content.find('.largefont').each((i, el) => {
                    const innerHtml = $(el).html();
                    const tableHtml = `
<table style="width: 100%; border-collapse: collapse; margin-top: 15pt; margin-bottom: 15pt;">
  <tr>
    <td style="border: 1.5pt solid #333; padding: 15pt; background-color: #fcfcfc;">
      <div style="font-size: 16pt; line-height: 1.5;">
        ${innerHtml}
      </div>
    </td>
  </tr>
</table>`;
                    $(el).replaceWith(tableHtml);
                });
                
                // Process gatha (Verses)
                content.find('.gatha').each((i, el) => {
                    $(el).attr('style', 'margin-left: 30pt; margin-bottom: 10pt; font-style: italic; display: block;');
                });

                // Preserve pali-text
                content.find('.pali-text').each((i, el) => {
                   $(el).attr('style', 'font-style: italic;');
                });

                // Remove internal links to other html files
                content.find('a').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href && href.endsWith('.html') && !href.startsWith('http')) {
                        $(el).replaceWith($(el).text());
                    }
                });

                html += content.html() + '\n';
            }
        }
        
        if (item.children && item.children.length > 0) {
            html += processToc(item.children);
        }
    }
    return html;
}

const tocData = JSON.parse(fs.readFileSync(TOC_PATH, 'utf-8'));
const bookHtmlContent = processToc(tocData);

const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Monastic Procedures</title>
    <style>
        body { font-family: serif; line-height: 1.6; }
        h1, h2, h3, h4 { margin-top: 1.5em; page-break-before: always; }
        h1 { font-size: 24pt; }
        h2 { font-size: 20pt; }
        h3 { font-size: 16pt; }
        .pali-text { font-style: italic; }
        .largefont { border: 2pt solid black; padding: 12pt; font-size: 16pt; margin: 12pt 0; }
    </style>
</head>
<body>
    ${bookHtmlContent}
</body>
</html>
`;

fs.writeFileSync(OUTPUT_HTML, fullHtml);
console.log(`Successfully generated ${OUTPUT_HTML}`);

// Run pandoc
try {
    console.log(`Converting to ${OUTPUT_DOCX} using pandoc...`);
    // --toc: include table of contents
    // --toc-depth=3: level of headings in TOC
    execSync(`pandoc "${OUTPUT_HTML}" -o "${OUTPUT_DOCX}" --toc --toc-depth=2`);
    console.log(`Successfully generated ${OUTPUT_DOCX}`);
} catch (error) {
    console.error('Pandoc conversion failed:', error.message);
    process.exit(1);
}
