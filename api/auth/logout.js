const { sendJson, handler } = require("../_lib/http");
const { destroySession, sessionCookie, getCookie, header } = require("../_lib/auth");

module.exports = handler(async function (request, response) {
  if (request.method !== "POST" && request.method !== "DELETE") return false;
  const token = header(request, "x-session-token") || getCookie(request, "arc_session");
  await destroySession(token);
  response.setHeader("Set-Cookie", sessionCookie("", 0));
  return sendJson(response, 200, { ok: true, cleared: true });
}, { auth: false });
