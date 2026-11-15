// Gerador mínimo de XLSX (OOXML) sem dependências: ZIP (método "store") + planilhas com estilos.

const CRC_TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABELA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {{nome:string, dados:string|Buffer}[]} arquivos @returns {Buffer} */
export function criarZip(arquivos) {
  const locais = [];
  const centrais = [];
  let offset = 0;
  for (const { nome, dados } of arquivos) {
    const conteudo = Buffer.isBuffer(dados) ? dados : Buffer.from(dados, 'utf8');
    const nomeBuf = Buffer.from(nome, 'utf8');
    const crc = crc32(conteudo);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(conteudo.length, 18); local.writeUInt32LE(conteudo.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26); local.writeUInt16LE(0, 28);
    locais.push(local, nomeBuf, conteudo);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(conteudo.length, 20); central.writeUInt32LE(conteudo.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28); central.writeUInt32LE(offset, 42);
    centrais.push(central, nomeBuf);
    offset += 30 + nomeBuf.length + conteudo.length;
  }
  const tamCentral = centrais.reduce((t, b) => t + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(tamCentral, 12); fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, ...centrais, fim]);
}

const xml = (s) => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const colLetra = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// Estilos: 0 normal, 1 cabeçalho, 2 moeda, 3 negrito (níveis de agrupamento), 4 número, 5 título
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>
<fonts count="4"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A8A"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="thin"><color rgb="FFD4D4D8"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="6">
<xf fontId="0" borderId="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fontId="1" fillId="2" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>
<xf fontId="0" borderId="1" numFmtId="164" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>
<xf fontId="2" borderId="1" applyFont="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fontId="0" borderId="1" numFmtId="4" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>
<xf fontId="3" applyFont="1"/>
</cellXfs></styleSheet>`;

/**
 * @typedef {{chave:string, rotulo:string, largura?:number, tipo?:'texto'|'numero'|'moeda'}} Coluna
 * @typedef {{nome:string, titulo?:string, colunas:Coluna[], linhas:object[], negrito?:(linha:object)=>boolean}} Planilha
 */
function planilhaXml({ titulo, colunas, linhas, negrito = () => false }) {
  const rows = [];
  let r = 1;
  if (titulo) { rows.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="5"><is><t>${xml(titulo)}</t></is></c></row>`); r += 2; }
  const cab = r;
  rows.push(`<row r="${r}" ht="28" customHeight="1">${colunas.map((c, i) =>
    `<c r="${colLetra(i)}${r}" t="inlineStr" s="1"><is><t>${xml(c.rotulo)}</t></is></c>`).join('')}</row>`);
  for (const linha of linhas) {
    r += 1;
    const forte = negrito(linha);
    const cells = colunas.map((c, i) => {
      const ref = `${colLetra(i)}${r}`;
      const v = linha[c.chave];
      if (v === null || v === undefined || v === '') return '';
      if ((c.tipo === 'numero' || c.tipo === 'moeda') && typeof v === 'number') {
        return `<c r="${ref}" s="${c.tipo === 'moeda' ? 2 : 4}"><v>${v}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr" s="${forte ? 3 : 0}"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('');
    rows.push(`<row r="${r}">${cells}</row>`);
  }
  const cols = colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura ?? 18}" customWidth="1"/>`).join('');
  const ultima = `${colLetra(colunas.length - 1)}${Math.max(r, cab)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${cab}" topLeftCell="A${cab + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>
<autoFilter ref="A${cab}:${ultima}"/></worksheet>`;
}

/** @param {Planilha[]} planilhas @returns {Buffer} */
export function criarXlsx(planilhas) {
  const nomes = planilhas.map((p, i) => xml((p.nome || `Planilha${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)));
  const arquivos = [
    { nome: '[Content_Types].xml', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${planilhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>` },
    { nome: '_rels/.rels', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nome: 'xl/workbook.xml', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
${nomes.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${planilhas.map((p, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${nomes[i]}'!$A$${p.titulo ? 3 : 1}:$${colLetra(p.colunas.length - 1)}$${(p.titulo ? 3 : 1) + p.linhas.length}</definedName>`).join('')}</definedNames></workbook>` },
    { nome: 'xl/_rels/workbook.xml.rels', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${planilhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${planilhas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nome: 'xl/styles.xml', dados: ESTILOS },
    ...planilhas.map((p, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: planilhaXml(p) }))
  ];
  return criarZip(arquivos);
}
