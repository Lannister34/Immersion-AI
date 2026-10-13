export interface MarkDotProps {
  title: string;
}

export function MarkDot({ title }: MarkDotProps) {
  return <span aria-hidden="true" className="mark-dot" title={title} />;
}
