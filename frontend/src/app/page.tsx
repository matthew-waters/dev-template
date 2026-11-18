"use client";

// Runs in the browser and calls the FastAPI backend on the same origin (/api/...).
// In production FastAPI serves this page; in `next dev` the /api rewrite forwards to uvicorn.

import { FormEvent, useEffect, useState } from "react";

type Health = { status: string; name: string; version: string };

export default function Home() {
  const [status, setStatus] = useState("checking…");
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<Health>)
      .then((data) => setStatus(`${data.status} (version ${data.version})`))
      .catch(() => setStatus("unreachable"));
  }, []);

  async function sayHello(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch(`/api/hello?name=${encodeURIComponent(name || "world")}`);
    const data: { message: string } = await res.json();
    setGreeting(data.message);
  }

  return (
    <main>
      <h1>DevWorkflow Example</h1>
      <p>
        Backend status: <span>{status}</span>
      </p>

      <form onSubmit={sayHello}>
        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={name}
          placeholder="world"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit">Say hello</button>
      </form>
      <p>{greeting}</p>
    </main>
  );
}
