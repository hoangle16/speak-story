import express from "express";
import ttsRoutes from "./tts.routes";
import configRoutes from "./config.routes";

const router = express.Router();

router.use("/tts", ttsRoutes);
router.use("/selectors", configRoutes);

export default router;
