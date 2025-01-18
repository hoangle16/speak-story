import express from "express";
import * as ttsController from "../controllers/tts.controller";
import multer from "multer";

const router = express.Router();
const upload = multer();
router.get("/voices", ttsController.getVoices);
router.post("/convert", upload.none(), ttsController.convertTextToSpeech);

export default router;
