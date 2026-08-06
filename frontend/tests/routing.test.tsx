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
  it('renders the shell on every route', async () => {
    renderAt('/');
    expect(
      screen.getByRole('link', { name: 'Poker Learner' })
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    await screen.findByRole('link', { name: /Raise First In/ });
  });

  it('renders the drill picker at /, listing drills from the server', async () => {
    renderAt('/');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Drills' })
    ).toBeInTheDocument();

    const link = await screen.findByRole('link', { name: /Raise First In/ });
    expect(link).toHaveAttribute('href', '/drill/rfi');
  });

  it('renders the drill runner for the id in the route', async () => {
    renderAt('/drill/rfi');
    // The runner resolves the id against the server's drill list, so the
    // heading is the drill's name rather than the raw route parameter.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Raise First In' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Start session' })
    ).toBeInTheDocument();
  });

  it('falls back to a not-found page', () => {
    renderAt('/nope');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Not found' })
    ).toBeInTheDocument();
  });
});
