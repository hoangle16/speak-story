import { Router } from "express";
import * as configController from "../controllers/config.controller";
import { authenticate, checkRole } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticate, checkRole(["admin"]));

router.get("/configs", configController.getAllConfigs);
router.get("/configs/:key", configController.getConfig);
router.post("/configs/:key", configController.addConfig);
router.put("/configs/:key", configController.updateConfig);
router.delete("/configs/:key", configController.removeConfig);

export default router;
