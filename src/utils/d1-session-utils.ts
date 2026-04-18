export const D1_BOOKMARK_HEADER = 'x-d1-bookmark';

type D1SessionContext = {
  env: any;
  session: any | null;
  constraint: string | null;
};

const READ_ONLY_POST_PATHS = new Set([
  '/api/plants/smart-match',
  '/api/care-advice'
]);

function isReadOnlyRequest(request: Request, path: string): boolean {
  const method = request.method.toUpperCase();
  return method === 'GET'
    || method === 'HEAD'
    || (method === 'POST' && READ_ONLY_POST_PATHS.has(path));
}

function getIncomingBookmark(request: Request): string | null {
  const bookmark = request.headers.get(D1_BOOKMARK_HEADER)?.trim();
  if (!bookmark || bookmark.length > 4096 || /[\r\n]/.test(bookmark)) {
    return null;
  }
  return bookmark;
}

function getSessionConstraint(request: Request, path: string): string {
  const incomingBookmark = getIncomingBookmark(request);
  if (incomingBookmark && isReadOnlyRequest(request, path)) {
    return incomingBookmark;
  }

  return isReadOnlyRequest(request, path) ? 'first-unconstrained' : 'first-primary';
}

function getBookmarkFromSession(session: any): string | null {
  if (!session || typeof session.getBookmark !== 'function') {
    return null;
  }

  const bookmark = session.getBookmark();
  if (typeof bookmark === 'string') {
    return bookmark || null;
  }

  return typeof bookmark?.bookmark === 'string' ? bookmark.bookmark : null;
}

function setExposeHeader(headers: Headers, headerName: string) {
  const existing = headers.get('Access-Control-Expose-Headers') || '';
  const exposed = existing
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!exposed.includes(headerName.toLowerCase())) {
    headers.set(
      'Access-Control-Expose-Headers',
      existing ? `${existing}, ${headerName}` : headerName
    );
  }
}

export function createD1SessionContext(request: Request, env: any, path: string): D1SessionContext {
  if (!env?.DB || typeof env.DB.withSession !== 'function') {
    return { env, session: null, constraint: null };
  }

  const constraint = getSessionConstraint(request, path);
  const session = env.DB.withSession(constraint);

  return {
    env: { ...env, DB: session },
    session,
    constraint
  };
}

export function appendD1Bookmark(response: Response, context: D1SessionContext): Response {
  const bookmark = getBookmarkFromSession(context.session);
  if (!bookmark) {
    return response;
  }

  const applyHeaders = (headers: Headers) => {
    headers.set(D1_BOOKMARK_HEADER, bookmark);
    setExposeHeader(headers, D1_BOOKMARK_HEADER);
  };

  try {
    applyHeaders(response.headers);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    applyHeaders(headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
}
