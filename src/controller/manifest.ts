// Keep asset URL imports out of facts/validation modules used by the server.
import controllerAsset from '../assets/controller.glb?url';
import { controllerManifest } from './facts';
export * from './facts';
export const manifest = { ...controllerManifest, asset: controllerAsset as string | null };
