import { useState } from 'react';

import { ChevronRightIcon, ReasoningIcon } from '../../../shared/ui/icons';

export interface ReasoningBlockProps {
  defaultOpen?: boolean;
  text: string;
}

export function ReasoningBlock({ defaultOpen = false, text }: ReasoningBlockProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="reasoning">
      <button className="reasoning__toggle" onClick={() => setIsOpen((current) => !current)} type="button">
        <ChevronRightIcon className="chevron" size={12} />
        <ReasoningIcon size={12} />
        <span>Размышления</span>
      </button>
      {isOpen ? <div className="reasoning__body">{text}</div> : null}
    </div>
  );
}
