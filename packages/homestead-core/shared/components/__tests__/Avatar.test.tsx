import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar, hueIndexOf, initialsOf } from '../Avatar';

describe('initialsOf', () => {
  it('takes the first letter of the first two words, uppercased', () => {
    expect(initialsOf('John Doe')).toBe('JD');
    expect(initialsOf('mary ann smith')).toBe('MA');
    expect(initialsOf('  Sam  ')).toBe('S');
    expect(initialsOf('émile zola')).toBe('ÉZ');
    expect(initialsOf('')).toBe('?');
  });
});

describe('hueIndexOf', () => {
  it('is stable for a name, ignoring case and padding, and spreads across the hues', () => {
    expect(hueIndexOf('John Doe')).toBe(hueIndexOf('john doe '));
    const seen = new Set(['Ada', 'Bob', 'Cleo', 'Dan', 'Eve', 'Finn', 'Gus', 'Hal', 'Ivy', 'Jo'].map((n) => hueIndexOf(n)));
    expect(seen.size).toBeGreaterThan(3);
    for (const i of seen) expect(i).toBeGreaterThanOrEqual(0);
    for (const i of seen) expect(i).toBeLessThan(8);
  });
});

describe('Avatar', () => {
  it('renders the initials in a hidden, titled circle', () => {
    render(<Avatar name="John Doe" />);
    const el = screen.getByTestId('avatar');
    expect(el).toHaveTextContent('JD');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveAttribute('title', 'John Doe');
    expect(el.className).toContain('rounded-full');
    expect(el.className).toContain('font-display');
  });

  it('sizes and passes a style through', () => {
    render(<Avatar name="Sam" size="lg" style={{ opacity: 0.5 }} className="extra" />);
    const el = screen.getByTestId('avatar');
    expect(el.className).toContain('size-14');
    expect(el.className).toContain('extra');
    expect(el.style.opacity).toBe('0.5');
  });

  it('gives the same name the same hue everywhere', () => {
    const { unmount } = render(<Avatar name="Cleo Park" />);
    const first = screen.getByTestId('avatar').className;
    unmount();
    render(<Avatar name="Cleo Park" size="sm" />);
    const hue = (cls: string) => cls.split(' ').filter((c) => /^(bg|text)-[a-z]+-\d+$/.test(c)).join(' ');
    expect(hue(screen.getByTestId('avatar').className)).toBe(hue(first));
  });
});
