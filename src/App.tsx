import { Component, createSignal } from 'solid-js';

import ImageZoom from './components/ImageZoom';

const App: Component = () => {
  const [format, setFormat] = createSignal("dzi");
  return (
    <div class="App">
      <header>
        <div>
          <h1>Deep Zoom Image</h1>
          <h2>Tile Pyramid viewer example</h2>
        </div>
        <nav>
          <span>Supported format:</span>
          <ul>
          <li data-selected={format() == 'dzi'} title="Deep Zoom Image format" onClick={()=>setFormat("dzi")}>DZI</li>
          <li data-selected={format() == 'zoomify'} title="Zoomify Image format" onClick={()=>setFormat("zoomify")}>Zoomify</li>
          </ul>
        </nav>
      </header>
      {format() == "dzi" && <ImageZoom src="/images/dzi/imageproxy.json"></ImageZoom>}
      {format() == "zoomify" && <ImageZoom src="/images/zoomify/imageproxy.json"></ImageZoom>}
      <div class="logos">
        <div>
          <a href="https://github.com/janumedia" title="Source Code" target="_blank" rel="noopener noreferrer">
            <img src="/assets/github-logo.svg" height="24" alt="Github Logo"/>
          </a>
          <span>Source code</span>
        </div>
        <div>
          <a href="https://www.tropenmuseum.nl" title="Source Photo #1" target="_blank" rel="noopener noreferrer">
            <img src="/assets/tropenmuseum-logo.svg" height="24" alt="Tropen Museum Logo"/>
          </a>
          <span>Source Photo #1</span>
        </div>
        <div>
          <a href="https://commons.wikimedia.org" title="Source Photo #2" target="_blank" rel="noopener noreferrer">
            <img src="/assets/commons-logo.svg" height="24" alt="Wikimedia Commons Logo"/>
          </a>
          <span>Source Photo #2</span>
        </div>
      </div>
    </div>
  );
};

export default App;
