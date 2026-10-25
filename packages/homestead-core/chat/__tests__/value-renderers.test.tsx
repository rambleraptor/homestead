import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PhoneValue, { dialable } from '../components/values/PhoneValue';
import EmailValue from '../components/values/EmailValue';

describe('PhoneValue', () => {
  it('dials the digits of a written number', () => {
    expect(dialable('(555) 123-4567')).toBe('5551234567');
    expect(dialable('+44 20 7946 0958')).toBe('+442079460958');
    expect(dialable('ext 1')).toBeNull();
    render(<PhoneValue text="(555) 123-4567" />);
    expect(screen.getByTestId('chat-value-phone')).toHaveAttribute('href', 'tel:5551234567');
  });

  it('shows text that is not a number as text', () => {
    render(<PhoneValue text="call me" />);
    expect(screen.queryByTestId('chat-value-phone')).toBeNull();
    expect(screen.getByText('call me')).toBeInTheDocument();
  });
});

describe('EmailValue', () => {
  it('writes to a plain address', () => {
    render(<EmailValue text="jake@example.com" />);
    expect(screen.getByTestId('chat-value-email')).toHaveAttribute('href', 'mailto:jake@example.com');
  });

  it('never makes a link that prefills a message', () => {
    render(<EmailValue text="jake@example.com?subject=hi&body=x" />);
    expect(screen.queryByTestId('chat-value-email')).toBeNull();
  });
});
