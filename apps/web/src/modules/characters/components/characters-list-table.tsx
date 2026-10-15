import type { CharacterSummaryDto } from '@immersion/contracts/characters';

import { CharacterListRow } from './character-list-row';

interface CharactersListTableProps {
  characters: CharacterSummaryDto[];
}

export function CharactersListTable({ characters }: CharactersListTableProps) {
  return (
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Персонаж</th>
            <th>Чаты</th>
            <th>Изменён</th>
            <th style={{ width: 200 }} />
          </tr>
        </thead>
        <tbody>
          {characters.map((character) => (
            <CharacterListRow character={character} key={character.id} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
