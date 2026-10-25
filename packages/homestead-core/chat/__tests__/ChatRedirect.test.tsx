import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatRedirect } from '../components/ChatRedirect';

const renderAt = (path: string, id?: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/chat" element={<ChatRedirect params={{}} />} />
        <Route path="/chat/:id" element={<ChatRedirect params={id ? { id } : {}} />} />
        <Route path="/dashboard" element={<div data-testid="home" />} />
        <Route path="/dashboard/c/:id" element={<div data-testid="home-conversation" />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ChatRedirect', () => {
  it('opens /chat as a new conversation on the home', () => {
    renderAt('/chat');
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('opens /chat/<id> as the same conversation on the home', () => {
    renderAt('/chat/c1', 'c1');
    expect(screen.getByTestId('home-conversation')).toBeInTheDocument();
  });
});
