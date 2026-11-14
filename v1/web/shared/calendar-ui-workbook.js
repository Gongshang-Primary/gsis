import { encodeWorkbook } from './workbooks.mjs';

// The existing encoder keeps all text literal (including leading =, + or @).
// This presentation-only pass adds a readable weekly grid without changing values.
export async function encodeWeeklyWorkbook({ columns, rows, year }) {
  const bytes = await encodeWorkbook({
    metadata: { schemaVersion: 1, owner: 'calendar', kind: 'weekly-readable-view', year, mode: 'reporting', importable: false },
    sheets: { 'Weekly View': { columns, rows } },
  });
  const zip = await window.JSZip.loadAsync(bytes);
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="10"/><name val="Arial"/><color rgb="FF18364C"/></font><font><b/><sz val="10"/><name val="Arial"/><color rgb="FFFFFFFF"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF18364C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F4F8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFCBD5DF"/></left><right style="thin"><color rgb="FFCBD5DF"/></right><top style="thin"><color rgb="FFCBD5DF"/></top><bottom style="thin"><color rgb="FFCBD5DF"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  zip.file('xl/styles.xml', styles);
  const parse = value => new DOMParser().parseFromString(value, 'application/xml');
  const serialize = doc => new XMLSerializer().serializeToString(doc);
  const worksheet = parse(await zip.file('xl/worksheets/sheet2.xml').async('string'));
  const element = (name, attrs) => {
    const el = worksheet.createElementNS(ns, name);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
  };
  const widths = element('cols', {});
  widths.append(element('col', { min: 1, max: 1, width: 15, customWidth: 1 }), element('col', { min: 2, max: 8, width: 29, customWidth: 1 }));
  const data = worksheet.getElementsByTagName('sheetData')[0];
  const properties = element('sheetPr', {});
  properties.append(element('pageSetUpPr', { fitToPage: 1 }));
  worksheet.documentElement.prepend(properties);
  data.before(widths);
  [...data.children].forEach((row, index) => {
    row.setAttribute('ht', index === 0 ? '26' : String(Math.min(409, Math.max(60, ...rows[index - 1].map(value => String(value).split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 29)), 0) * 14 + 8)))));
    row.setAttribute('customHeight', '1');
    [...row.children].forEach((cell, column) => cell.setAttribute('s', index === 0 ? '1' : column === 0 || column >= 6 ? '3' : '2'));
  });
  worksheet.documentElement.append(element('pageMargins', { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }), element('pageSetup', { paperSize: 9, orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 }));
  zip.file('xl/worksheets/sheet2.xml', serialize(worksheet));
  zip.file('[Content_Types].xml', (await zip.file('[Content_Types].xml').async('string')).replace('</Types>', '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'));
  zip.file('xl/_rels/workbook.xml.rels', (await zip.file('xl/_rels/workbook.xml.rels').async('string')).replace('</Relationships>', '<Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
