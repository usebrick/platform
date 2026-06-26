import { useEffect, useState } from 'react';

export function SloppyCard({ user }: { user?: any }) {
  const [count, setCount] = useState(0);
  const [unused, setUnused] = useState(0);
  const name = user && user.profile && user.profile.name;

  useEffect(() => {
    document.title = 'slop';
  }, []);

  useEffect(() => {
    if (count > 0) console.log(count);
  }, [count]);

  useEffect(() => {
    console.log('soup');
  }, []);

  return (
    <>
      <div
        className="flex items-center justify-center min-h-screen text-center w-[9999px] h-[9999px] m-[calc(16px+8px)]"
        style={{ width: 'calc(100px + 2px)' }}
      >
        <button className="bg-blue-500 text-white px-4 py-2 outline-none">
          {name} {count}
        </button>
        <img src="/photo.jpg" alt="photo" loading="lazy" />
      </div>
      <div className="flex items-center justify-center min-h-screen text-center">
        generic slop
      </div>
    </>
  );
}
