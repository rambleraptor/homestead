import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecipeTags } from '../RecipeTags';

const TAGS = ['dinner', 'pasta', 'vegetarian', 'quick', 'italian'];

describe('RecipeTags', () => {
  it('renders nothing without tags', () => {
    const { container } = render(<RecipeTags tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('inline: caps at max and counts the rest, with the full list as a tooltip', () => {
    render(<RecipeTags tags={TAGS} variant="inline" max={3} />);
    const tags = screen.getByTestId('recipe-tags');
    expect(tags).toHaveTextContent('dinner · pasta · vegetarian+2');
    expect(tags).toHaveAttribute('title', TAGS.join(', '));
  });

  it('inline: no "+N" or tooltip when everything fits', () => {
    render(<RecipeTags tags={['dinner', 'pasta']} variant="inline" max={3} />);
    const tags = screen.getByTestId('recipe-tags');
    expect(tags).toHaveTextContent('dinner · pasta');
    expect(tags).not.toHaveAttribute('title');
  });

  it('chips: shows every tag by default', () => {
    render(<RecipeTags tags={TAGS} />);
    for (const tag of TAGS) expect(screen.getByText(tag)).toBeInTheDocument();
  });
});
