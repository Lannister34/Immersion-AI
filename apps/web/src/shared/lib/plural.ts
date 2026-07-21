export type RuPluralForms = readonly [one: string, few: string, many: string];

// Русская плюрализация: «1 чат», «2 чата», «5 чатов», с исключением 11–14 («11 чатов», «111 чатов»).
export function pluralRu(count: number, forms: RuPluralForms): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  let form = forms[2];
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) {
      form = forms[0];
    } else if (mod10 >= 2 && mod10 <= 4) {
      form = forms[1];
    }
  }
  return `${count} ${form}`;
}
