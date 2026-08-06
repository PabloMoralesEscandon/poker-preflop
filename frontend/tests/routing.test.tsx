import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>
  );
}

describe('app shell and routing', () => {
  it('renders the shell on every route', () => {
    renderAt('/');
    expect(
      screen.getByRole('link', { name: 'Poker Learner' })
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders the drill picker at /', () => {
    renderAt('/');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Drills' })
    ).toBeInTheDocument();
  });

  it('renders the drill route with its id parameter', () => {
    renderAt('/drill/rfi');
    expect(
      screen.getByRole('heading', { level: 1, name: 'rfi' })
    ).toBeInTheDocument();
  });

  it('falls back to a not-found page', () => {
    renderAt('/nope');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Not found' })
    ).toBeInTheDocument();
  });
});
