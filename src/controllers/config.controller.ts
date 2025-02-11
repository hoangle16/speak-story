import { Request, Response } from "express";
import { configService } from "../services/config.service";

export const getAllConfigs = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const configs = await configService.getAllConfigs();
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch configs" });
  }
};

export const getConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await configService.getConfig(req.params.key);
    if (!config) {
      res.status(404).json({ error: "Config not found" });
      return;
    }
    res.json(config);
  } catch (error) {
    res.status(404).json({ error: "Config not found" });
  }
};

export const addConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { key } = req.params;
    const config = req.body;

    if (!configService.validateConfig(config)) {
      res.status(400).json({ error: "Invalid config format" });
      return;
    }

    await configService.addConfig(key, config);
    res.status(201).json({ message: "Config added successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to add config" });
  }
};

export const updateConfig = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { key } = req.params;
    const config = req.body;
    if (!configService.validateConfig(config)) {
      res.status(400).json({ error: "Invalid config format" });
      return;
    }
    await configService.updateConfig(key, config);
    res.status(200).json({ message: "Config updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update config" });
  }
};

export const removeConfig = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const deleted = await configService.removeConfig(req.params.key);
    if (!deleted) {
      res.status(404).json({ error: "Config not found" });
      return;
    }
    res.json({ message: "Config deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete config" });
  }
};
