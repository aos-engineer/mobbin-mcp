import type sharp from "sharp";

type SharpFn = typeof sharp;

let sharpModulePromise: Promise<SharpFn> | null = null;

export async function getSharp(): Promise<SharpFn> {
  if (!sharpModulePromise) {
    sharpModulePromise = import("sharp")
      .then((module) => (module.default ?? module) as unknown as SharpFn)
      .catch((error) => {
        sharpModulePromise = null;
        throw new Error(
          "Image processing tools are unavailable because 'sharp' could not be loaded. " +
            "Reinstall the package or use a full install path instead of a cold npx launch.",
          { cause: error },
        );
      });
  }

  return sharpModulePromise;
}
