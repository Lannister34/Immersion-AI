import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { causeOf } from '../errors/cause-of.mjs';
import { readTextIfPresent } from '../files/read-text-if-present.mjs';

export class BaselineFile {
  #path;
  #label;
  #codec;
  #GateError;

  constructor({ path: baselinePath, label, codec, GateError }) {
    this.#path = baselinePath;
    this.#label = label;
    this.#codec = codec;
    this.#GateError = GateError;
  }

  read() {
    const text = readTextIfPresent(this.#path, this.#label, this.#GateError);
    if (text === null) return null;
    try {
      return this.#codec.parse(text);
    } catch (error) {
      if (!(error instanceof this.#GateError)) throw error;
      throw new this.#GateError(
        `${this.#label} ${error.message}; fix it, or restore it with git checkout -- ${this.#label}`,
      );
    }
  }

  lower(lowerFrom) {
    const temporary = `${this.#path}.tmp`;
    this.#claim(temporary);
    try {
      const lowered = lowerFrom(this.read());
      this.#replaceFrom(temporary, this.#codec.serialize(lowered));
      return lowered;
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }

  #claim(temporary) {
    try {
      mkdirSync(path.dirname(temporary), { recursive: true });
      writeFileSync(temporary, '', { flag: 'wx' });
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new this.#GateError(
          `${this.#label}.tmp exists: another --update-baseline is running, or one stopped before replacing ` +
            `${this.#label}; delete it once no update runs`,
        );
      }
      throw new this.#GateError(`${this.#label} cannot be written: ${causeOf(error)}`);
    }
  }

  #replaceFrom(temporary, text) {
    try {
      writeFileSync(temporary, text);
      renameSync(temporary, this.#path);
    } catch (error) {
      throw new this.#GateError(`${this.#label} cannot be written: ${causeOf(error)}`);
    }
  }
}
