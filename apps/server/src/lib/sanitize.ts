import sanitizeHtml from 'sanitize-html';

/** Tags and attributes the panel's TipTap editor produces. Everything else is stripped. */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 's', 'u', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'a', 'span', 'div', 'img', 'iframe',
  ],
  allowedAttributes: {
    '*': ['style'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    iframe: ['src', 'width', 'height', 'allowfullscreen', 'frameborder'],
    div: ['data-youtube-video'],
  },
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
      'text-align': [/^(left|center|right)$/],
      width: [/^\d+(px|%)$/],
      height: [/^\d+(px|%)$/],
    },
  },
  allowedSchemes: ['https', 'http', 'mailto'],
  allowedSchemesByTag: { img: ['https', 'http'] },
  allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

export function sanitizeChangelog(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
