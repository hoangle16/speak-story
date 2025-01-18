import express from "express";
import ttsRoutes from "./tts.routes";

const router = express.Router();

router.use("/tts", ttsRoutes);

export default router;