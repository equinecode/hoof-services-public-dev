import { Router } from "express";
import { getAuth } from "../middleware/clerk";

export const meRouter = Router();

meRouter.get("/", (req, res) => {
  const auth = getAuth(req);

  res.json({
    userId: auth.userId,
    sessionId: auth.sessionId,
    orgId: auth.orgId,
    orgRole: auth.orgRole,
  });
});
