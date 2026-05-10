import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CurriculumDag } from './curriculum-dag.js';

describe('CurriculumDag', () => {
  test('renders curriculum nodes as interactable DAG nodes', () => {
    const handleNodeClick = vi.fn();

    render(
      <CurriculumDag
        nodes={[
          {
            id: 'node_1' as never,
            curriculumVersionId: 'version_1' as never,
            stableNodeKey: 'stable_1',
            label: 'Arithmetic',
            stabilityThreshold: 0.75,
            estimatedSessions: 2,
            traversalWeight: 1,
          },
          {
            id: 'node_2' as never,
            curriculumVersionId: 'version_1' as never,
            stableNodeKey: 'stable_2',
            label: 'Algebra',
            learningObjective: 'Use symbolic equations with confidence.',
            stabilityThreshold: 0.8,
            estimatedSessions: 3,
            traversalWeight: 2,
          },
        ]}
        edges={[
          {
            id: 'edge_1' as never,
            curriculumVersionId: 'version_1' as never,
            fromNodeId: 'node_1' as never,
            toNodeId: 'node_2' as never,
            type: 'prerequisite' as never,
            orderingWeight: 1,
          },
        ]}
        nodeBadgesById={{
          node_2: [{ label: 'Frontier', tone: 'frontier' }],
        }}
        onNodeClick={handleNodeClick}
      />
    );

    const algebraNode = screen.getByRole('button', { name: /curriculum node algebra/i });
    expect(screen.getByRole('button', { name: /curriculum node arithmetic/i })).toBeInTheDocument();
    expect(algebraNode).toBeInTheDocument();
    expect(screen.getByText(/frontier/i)).toBeInTheDocument();

    fireEvent.click(algebraNode);
    expect(handleNodeClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node_2',
        label: 'Algebra',
      })
    );
  });

  test('renders an empty message when no curriculum graph exists', () => {
    render(<CurriculumDag nodes={[]} edges={[]} emptyMessage="No DAG yet." />);

    expect(screen.getByText('No DAG yet.')).toBeInTheDocument();
  });
});
