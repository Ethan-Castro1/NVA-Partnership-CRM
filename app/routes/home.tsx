import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "AI Lab Schools | Playlab" },
    {
      name: "description",
      content:
        "Playlab's AI Lab Schools: schools building with AI alongside their students and teachers.",
    },
  ];
}

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Playlab
        </p>
        <h1 className="mt-3 text-4xl font-bold text-gray-900 dark:text-white">
          AI Lab Schools
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
          Schools building with AI alongside their students and teachers.
        </p>
        <a
          href="https://www.playlab.ai/ai-lab-schools"
          className="mt-8 inline-block rounded-lg bg-gray-900 px-6 py-3 font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
        >
          Learn about AI Lab Schools
        </a>
      </div>
    </main>
  );
}
