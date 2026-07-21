import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import {
  getCurrentSession,
  getCurrentUserApiKey,
  loginUser,
  logoutCurrentUser,
  regenerateCurrentUserApiKey,
  registerUser,
} from "@/server/auth/auth-service";
import {
  getRegistrationCapabilities,
  normalizeVerificationTarget,
  sendRegisterVerificationCode,
  type VerificationChannel,
} from "@/server/auth/verification-code-service";
import { badRequest } from "@/server/errors";
import { inferCountry } from "@/server/location/country-service";
import { assertRateLimit, requestIp } from "@/server/request-guard";
import {
  apiSuccess,
  assertRequestOrigin,
  guardRequest,
  requestHeaders,
  sessionToken,
} from "@/http";

function channelValue(value: unknown): VerificationChannel {
  if (value === "email" || value === "phone") return value;
  throw badRequest("验证码渠道不正确");
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/auth/registration-options", async () => apiSuccess(getRegistrationCapabilities()));

  app.post("/auth/verification-code", async (request) => {
    assertRequestOrigin(request);
    const body = (request.body || {}) as Record<string, unknown>;
    const channel = channelValue(body.channel);
    const target = normalizeVerificationTarget(channel, body.target);
    const targetHash = crypto.createHash("sha256").update(`${channel}:${target}`).digest("hex");
    const guard = guardRequest(request);
    await assertRateLimit(`auth:verification-code:ip:${requestIp(guard)}`, 5, 60 * 60 * 1000);
    await assertRateLimit(`auth:verification-code:target:${targetHash}`, 5, 60 * 60 * 1000);
    return apiSuccess(await sendRegisterVerificationCode(channel, target));
  });

  app.post("/auth/register", async (request, reply) => {
    assertRequestOrigin(request);
    await assertRateLimit(`auth:register:${requestIp(guardRequest(request))}`, 5, 60 * 60 * 1000);
    const result = await registerUser(request.body);
    reply.setCookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return reply.status(201).send(apiSuccess(result.data));
  });

  app.post("/auth/login", async (request, reply) => {
    assertRequestOrigin(request);
    await assertRateLimit(`auth:login:${requestIp(guardRequest(request))}`, 20, 15 * 60 * 1000);
    const result = await loginUser(request.body);
    reply.setCookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return apiSuccess(result.data);
  });

  app.post("/auth/logout", async (request, reply) => {
    assertRequestOrigin(request);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return apiSuccess(await logoutCurrentUser());
  });

  app.get("/auth/me", async (request) => apiSuccess(await getCurrentSession(sessionToken(request))));

  app.get("/auth/key", async (request) => apiSuccess(await getCurrentUserApiKey(sessionToken(request))));

  app.post("/auth/key", async (request) => {
    assertRequestOrigin(request);
    return apiSuccess(await regenerateCurrentUserApiKey(sessionToken(request)));
  });

  app.get("/location/country", async (request, reply) => {
    reply.headers({
      "Cache-Control": "private, no-store",
      Vary: "Accept-Language, CF-IPCountry, X-Vercel-IP-Country, CloudFront-Viewer-Country",
    });
    return apiSuccess(inferCountry(requestHeaders(request)));
  });
};

export default authRoutes;
