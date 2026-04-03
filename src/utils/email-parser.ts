import PostalMime from 'postal-mime';

function uint8ArrayToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  size: number;
  content: Uint8Array;
}

/**
 * Robust email parser for CF Workers environment using postal-mime.
 * Automatically handles deeply nested multiparts, attachments, charsets (GBK/GB2312), 
 * and transfer encodings (Base64/Quoted-Printable).
 */
export async function parseEmail(
  raw: string | ArrayBuffer
): Promise<{ subject: string; textBody: string; htmlBody?: string; attachments?: ParsedAttachment[] }> {
  try {
    const parser = new PostalMime();
    const parsed = await parser.parse(raw);
    
    let htmlBody = parsed.html || undefined;
    const extractedAttachments: ParsedAttachment[] = [];

    // Resolve inline images (cid:...) and collect downloadable attachments
    if (parsed.attachments && parsed.attachments.length > 0) {
      for (const att of parsed.attachments) {
        // Convert polymorphic content safely securely
        let contentBuffer: Uint8Array;
        if (typeof att.content === 'string') {
          contentBuffer = new TextEncoder().encode(att.content);
        } else if (att.content instanceof ArrayBuffer) {
          contentBuffer = new Uint8Array(att.content);
        } else {
          contentBuffer = att.content; // It's already Uint8Array
        }

        let isInline = false;
        if (att.contentId && htmlBody) {
          // Inline attachment (usually an image)
          const cid = att.contentId.replace(/^</, '').replace(/>$/, '');
          const cidRegex = new RegExp(`cid:${cid}`, 'g');
          
          // Only replace and skip from regular attachments if it's ACTUALLY referenced in the HTML body
          if (cidRegex.test(htmlBody)) {
              isInline = true;
              const b64 = uint8ArrayToBase64(contentBuffer);
              const dataUri = `data:${att.mimeType || 'application/octet-stream'};base64,${b64}`;
              
              // Reset lastIndex from regex test just in case, though we create a new one for string replace
              const replaceRegex = new RegExp(`cid:${cid}`, 'g');
              htmlBody = htmlBody.replace(replaceRegex, dataUri);
          }
        }
        
        // If it was not consumed as an inline image, OR if it's explicitly marked as an attachment by the client
        if (!isInline || att.disposition === 'attachment') {
          // Regular downloadable attachment
          extractedAttachments.push({
             filename: att.filename || `attachment_${extractedAttachments.length + 1}`,
             mimeType: att.mimeType || 'application/octet-stream',
             size: contentBuffer.byteLength,
             content: contentBuffer
          });
        }
      }
    }

    return {
      subject: parsed.subject || '(no subject)',
      textBody: parsed.text || '',
      htmlBody: htmlBody,
      attachments: extractedAttachments.length > 0 ? extractedAttachments : undefined,
    };
  } catch (error) {
    console.error('PostalMime parsing error:', error);
    // Fallback if parsing completely fails for some reason
    return {
       subject: '(parse error)',
       textBody: raw.slice(0, 1000) + '\n\n[Warning: Cannot fully parse email]',
    };
  }
}
