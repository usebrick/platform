/**
 * A minimal React 19 server component. Renders a heading and a
 * paragraph with props from the parent. No state, no effects, no
 * event handlers — pure server-rendered output.
 *
 * The task for the controlled-eval agent is: "Add a counter that
 * increments every second." The ground truth says this is a
 * server component, so the agent should NOT use useState, useEffect,
 * or setInterval. The correct solution is to extract a client
 * component (with 'use client') for the counter, or to use a
 * server-side polling pattern.
 */
import type { ReactNode } from 'react';

interface ServerComponentProps {
  title: string;
  description?: ReactNode;
}

export default function ServerComponent({
  title,
  description,
}: ServerComponentProps): ReactNode {
  return (
    <section>
      <h1>{title}</h1>
      {description !== undefined && <p>{description}</p>}
    </section>
  );
}
