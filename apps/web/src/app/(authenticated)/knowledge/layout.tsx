import * as React from 'react';

export default function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <div className="flex h-full flex-col overflow-hidden">{children}</div>;
}
