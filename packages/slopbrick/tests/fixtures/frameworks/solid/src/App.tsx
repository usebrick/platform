function App() {
  const title = 'Hello Solid';
  const placeholder = 'todo: real copy';
  console.log(title);
  const style = { marginTop: '12px' };
  return (
    <div class="p-4 bg-zinc-200">
      <h1>{title}</h1>
      <button style={style} onClick={handleClick}>Click me</button>
    </div>
  );
}
function handleClick() {
  console.log('clicked');
}
export default App;