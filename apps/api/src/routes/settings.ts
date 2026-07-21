import type { FastifyPluginAsync } from "fastify";
import { requireAdminSession } from "@/server/auth/auth-service";
import { getSettingsMap, updateSettings } from "@/server/settings/settings-service";
import { apiSuccess, assertRequestOrigin, sessionToken } from "@/http";

const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/settings", async () => apiSuccess(await getSettingsMap()));

  app.put("/settings", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await updateSettings(request.body));
  });
};

export default settingsRoutes;
