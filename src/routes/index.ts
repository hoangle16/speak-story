import express from "express";
import ttsRoutes from "./tts.routes";
import configRoutes from "./config.routes";
import authRoutes from "./auth.routes";

const router = express.Router();

router.use("/tts", ttsRoutes);
router.use("/selectors", configRoutes);
router.use("/auth", authRoutes);

export default router;
