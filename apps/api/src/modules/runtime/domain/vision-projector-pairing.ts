import path from 'node:path';

export interface ScannedGgufFile {
  containingDirectory: string;
  path: string;
}

export type PairedModelFile<TFile extends ScannedGgufFile> = TFile & { visionProjectorPath: string | null };

const PROJECTOR_MARKER = /(?:^|[-_.])mmproj(?=[-_.]|$)/i;
const QUANTIZATION_SUFFIX = /[-_.](?:i?q\d+(?:_[a-z\d]+)*|bf16|fp16|fp32|f16|f32)$/i;
const NAME_SEPARATORS = /[-_.\s]/g;
const GENERIC_PROJECTOR_NAMES = new Set(['', 'model']);

function isVisionProjectorFile(filePath: string): boolean {
  return path.basename(filePath).toLowerCase().includes('mmproj');
}

function fileStem(filePath: string): string {
  return path.basename(filePath).replace(/\.gguf$/i, '');
}

function comparableName(stem: string): string {
  return stem.replace(QUANTIZATION_SUFFIX, '').replace(NAME_SEPARATORS, '').toLowerCase();
}

function modelName(filePath: string): string {
  return comparableName(fileStem(filePath));
}

function projectorModelName(filePath: string): string {
  return comparableName(fileStem(filePath).replace(PROJECTOR_MARKER, ''));
}

function groupByDirectory<TFile extends ScannedGgufFile>(files: readonly TFile[]): Map<string, TFile[]> {
  const groups = new Map<string, TFile[]>();

  for (const file of files) {
    const group = groups.get(file.containingDirectory) ?? [];
    group.push(file);
    groups.set(file.containingDirectory, group);
  }

  return groups;
}

function pairFolder<TFile extends ScannedGgufFile>(folderFiles: readonly TFile[]): PairedModelFile<TFile>[] {
  const projectors = folderFiles
    .filter((file) => isVisionProjectorFile(file.path))
    .map((file) => ({ path: file.path, modelName: projectorModelName(file.path) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const models = folderFiles.filter((file) => !isVisionProjectorFile(file.path));
  const namedProjectors = projectors
    .filter((projector) => !GENERIC_PROJECTOR_NAMES.has(projector.modelName))
    .sort((left, right) => right.modelName.length - left.modelName.length);

  const [onlyProjector] = projectors;
  const folderHoldsOneModel = new Set(models.map((model) => modelName(model.path))).size === 1;
  const sharedGenericProjector =
    projectors.length === 1 &&
    onlyProjector &&
    GENERIC_PROJECTOR_NAMES.has(onlyProjector.modelName) &&
    folderHoldsOneModel
      ? onlyProjector.path
      : null;

  return models.map((model) => {
    const name = modelName(model.path);
    const namedProjector = namedProjectors.find((projector) => name.startsWith(projector.modelName));

    return { ...model, visionProjectorPath: namedProjector?.path ?? sharedGenericProjector };
  });
}

export function pairVisionProjectors<TFile extends ScannedGgufFile>(files: readonly TFile[]): PairedModelFile<TFile>[] {
  return [...groupByDirectory(files).values()].flatMap((folderFiles) => pairFolder(folderFiles));
}
