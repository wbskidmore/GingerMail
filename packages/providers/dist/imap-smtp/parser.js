/**
 * Minimal RFC 822 parser. For production we should switch to `mailparser`,
 * but to keep dependencies small we ship a streamlined parser that extracts
 * the parts the renderer actually uses.
 */
export async function parseRfc822(source) {
    const raw = source.toString('utf8');
    const { headerBlock, body } = splitHeader(raw);
    const headers = parseHeaders(headerBlock);
    const contentType = headers['content-type'] ?? 'text/plain';
    const { mime, boundary, charset } = parseContentType(contentType);
    let html;
    let text;
    const attachments = [];
    if (boundary) {
        const parts = splitMultipart(body, boundary);
        let partIdx = 0;
        for (const part of parts) {
            partIdx += 1;
            const { headerBlock: ph, body: pb } = splitHeader(part);
            const partHeaders = parseHeaders(ph);
            const pct = partHeaders['content-type'] ?? 'text/plain';
            const pcd = partHeaders['content-disposition'] ?? '';
            const pte = partHeaders['content-transfer-encoding'] ?? '7bit';
            const decoded = decodePart(pb, pte, parseCharset(pct));
            const { mime: pmime } = parseContentType(pct);
            if (/^attachment/i.test(pcd) || /name=/.test(pct)) {
                attachments.push({
                    partId: String(partIdx),
                    contentType: pmime,
                    filename: extractFilename(pcd, pct),
                    size: Buffer.byteLength(decoded),
                });
                continue;
            }
            if (pmime === 'text/html' && !html)
                html = decoded.toString('utf8');
            else if (pmime === 'text/plain' && !text)
                text = decoded.toString('utf8');
        }
    }
    else {
        const decoded = decodePart(body, headers['content-transfer-encoding'] ?? '7bit', charset);
        if (mime === 'text/html')
            html = decoded.toString('utf8');
        else
            text = decoded.toString('utf8');
    }
    return {
        html,
        text,
        attachments,
        inReplyTo: headers['in-reply-to']?.replace(/[<>]/g, ''),
        references: headers['references']?.split(/\s+/).map((r) => r.replace(/[<>]/g, '')),
        headers,
    };
}
function splitHeader(raw) {
    const idx = raw.indexOf('\r\n\r\n');
    const lfIdx = raw.indexOf('\n\n');
    let sep = -1;
    let len = 0;
    if (idx !== -1 && (lfIdx === -1 || idx < lfIdx)) {
        sep = idx;
        len = 4;
    }
    else if (lfIdx !== -1) {
        sep = lfIdx;
        len = 2;
    }
    if (sep === -1)
        return { headerBlock: raw, body: '' };
    return { headerBlock: raw.slice(0, sep), body: raw.slice(sep + len) };
}
function parseHeaders(block) {
    const out = {};
    const lines = [];
    for (const line of block.split(/\r?\n/)) {
        if (/^\s/.test(line) && lines.length > 0) {
            lines[lines.length - 1] = (lines[lines.length - 1] ?? '') + ' ' + line.trim();
        }
        else {
            lines.push(line);
        }
    }
    for (const line of lines) {
        const i = line.indexOf(':');
        if (i === -1)
            continue;
        const key = line.slice(0, i).trim().toLowerCase();
        const value = line.slice(i + 1).trim();
        out[key] = value;
    }
    return out;
}
function parseContentType(ct) {
    const [main, ...rest] = ct.split(';').map((s) => s.trim());
    const params = {};
    for (const p of rest) {
        const idx = p.indexOf('=');
        if (idx === -1)
            continue;
        params[p.slice(0, idx).toLowerCase()] = p
            .slice(idx + 1)
            .replace(/^"|"$/g, '')
            .trim();
    }
    return { mime: (main ?? 'text/plain').toLowerCase(), boundary: params['boundary'], charset: params['charset'] };
}
function parseCharset(ct) {
    return parseContentType(ct).charset ?? 'utf-8';
}
function splitMultipart(body, boundary) {
    const delim = `--${boundary}`;
    const parts = body.split(delim);
    return parts.slice(1, -1).map((p) => p.replace(/^\r?\n/, '').replace(/\r?\n$/, ''));
}
function decodePart(body, encoding, _charset) {
    const enc = encoding.toLowerCase();
    if (enc === 'base64')
        return Buffer.from(body.replace(/\s+/g, ''), 'base64');
    if (enc === 'quoted-printable')
        return Buffer.from(decodeQuotedPrintable(body), 'utf8');
    return Buffer.from(body, 'utf8');
}
function decodeQuotedPrintable(input) {
    return input
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
function extractFilename(disposition, contentType) {
    const m = /(?:filename|name)=("([^"]+)"|([^;]+))/i.exec(disposition + ';' + contentType);
    return m ? (m[2] ?? m[3] ?? 'attachment').trim() : 'attachment';
}
//# sourceMappingURL=parser.js.map