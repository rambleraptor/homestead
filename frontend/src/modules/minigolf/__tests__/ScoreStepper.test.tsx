import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScoreStepper } from '../components/ScoreStepper';

describe('ScoreStepper', () => {
  it('renders the current value and label', () => {
    render(
      <ScoreStepper value={3} onChange={() => {}} label="Par" testId="par" />,
    );
    expect(screen.getByTestId('par-value')).toHaveTextContent('3');
    expect(screen.getByText('Par')).toBeInTheDocument();
  });

  it('calls onChange when incrementing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ScoreStepper value={3} onChange={onChange} testId="s" />);
    await user.click(screen.getByTestId('s-inc'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('calls onChange when decrementing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ScoreStepper value={3} onChange={onChange} testId="s" />);
    await user.click(screen.getByTestId('s-dec'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('clamps to the min value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScoreStepper value={1} onChange={onChange} min={1} testId="s" />,
    );
    const dec = screen.getByTestId('s-dec');
    expect(dec).toBeDisabled();
    await user.click(dec);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps to the max value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScoreStepper value={9} onChange={onChange} max={9} testId="s" />,
    );
    const inc = screen.getByTestId('s-inc');
    expect(inc).toBeDisabled();
    await user.click(inc);
    expect(onChange).not.toHaveBeenCalled();
  });
});
