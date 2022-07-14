import { createSignal, onMount, onCleanup } from "solid-js";

const ZOOM_SPEED:number = 0.1;
const BASED_TILE_SIZE:number = 256;
const MAX_CANVAS_SIZE:number = 3800 * 3800; // performance purpose: we use below iOS max canvas size limitation (4096 * 4096)

const DZI_BASED_PATHNUMBER:number = 8;
const ZOOMIFY_BASED_PATHNUMBER:number = 1;

interface Pointer {
    start:PointerEvent,
    updated?:PointerEvent
}

interface TypeRatio  {
    ratioX:number,
    ratioY:number,
    offsetX:number,
    offsetY:number
}

interface CanvasSize {
    width:number,
    height:number,
    scale:number
}

interface Tile {
    loaded:boolean, 
    x:number,
    y:number,
    sizeW:number,
    sizeH:number,
    basedNum:number
}

interface TilePyramid {
    pathNum:number,
    tileXCount:number;
    tileYCount:number;
    canvasWidth:number,
    canvasHeight:number
}

interface ImageZoomProp {
    src:string
}

function generateTilePyramid(w:number, h:number, format:string):TilePyramid[] {
    let tiles:TilePyramid[] = [];
    let size:number = w > h ? w : h;
    let canvasWidth:number = w;
    let canvasHeight:number = h;
    let step:number = Math.round(Math.log(h/BASED_TILE_SIZE)/Math.log(2));

    while(size > BASED_TILE_SIZE) {
        let lenW:number = Math.ceil(canvasWidth / BASED_TILE_SIZE);
        let lenH:number = Math.ceil(canvasHeight / BASED_TILE_SIZE);

        tiles.push({
            pathNum: step,
            tileXCount:lenW,
            tileYCount:lenH,
            canvasWidth,
            canvasHeight
        })

        canvasWidth = Math.round(canvasWidth / 2);
        canvasHeight = Math.round(canvasHeight / 2);
        step--;
        size /= 2;
    }

    return tiles.reverse();
}

function intersect(r1:DOMRect, r2:DOMRect):boolean {
    if(r1.left >= r2.right || r2.left >= r1.right || r1.top >= r2.bottom || r2.top >= r1.bottom) return false;
    return true;
}

function canvasSize(w:number, h:number):CanvasSize {
    const sourceSize:number = w * h;
    if(sourceSize < MAX_CANVAS_SIZE) return {width:w, height:h, scale:1};
    const scale:number = Math.sqrt(MAX_CANVAS_SIZE) / Math.sqrt(sourceSize);
    return {width:w * scale, height:h * scale, scale};
}

// better solutions to release canvas memory
// https://pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/
function releaseCanvas(canvas:HTMLCanvasElement):void{
    if(canvas == undefined) return;
    
    // make it small
    canvas.width = 1;
    canvas.height = 1;
    canvas.getContext("2d")?.clearRect(0, 0, 1, 1);
}

function ImageZoom(props:ImageZoomProp) {
    let canvas: HTMLCanvasElement | undefined;
    let wrapper: HTMLDivElement | undefined;
    let context: CanvasRenderingContext2D | null;

    let canvasOriW:number = 0;
    let canvasOriH:number = 0;
    let canvasW:number = canvasOriW;
    let canvasH:number = canvasOriH;
    let canvasScale:number = 1; // canvas scale compare to MAX_CANVAS_SIZE

    // cached canvas
    // use to saved original rendered canvas
    let cachedCanvas: HTMLCanvasElement = document.createElement("canvas");
    let cachedCtx: CanvasRenderingContext2D | null = cachedCanvas.getContext("2d");

    let prevX: number = 0;
    let prevY: number = 0;
    let translateX: number = prevX;
    let translateY: number = prevY;
    let zoomScale: number = 1;

    let pointers: Pointer[] = [];
    let pinchedDistanceStart: number = 0;
    let pinchedDistanceEnd: number = 0;
    let touchStarted: boolean = false;

    let tiles:Tile[];
    let images:HTMLImageElement[] = [];
    let tilesPyramid:TilePyramid[];

    const imageFolder:string = props.src.substring(0, props.src.lastIndexOf("/"));

    let format:string = "dzi";

    const [caption, setCaption] = createSignal("");

    onMount(async() => {
        // set canvas context
        context = canvas!.getContext("2d");
    
        // get image data
        const data = await fetch(props.src).then(res => res.json());

        format = data.format;
        canvasOriW = data.width;
        canvasOriH = data.height;

        const {width, height, scale}  = canvasSize(canvasOriW, canvasOriH); 
        canvasScale = scale;
        cachedCanvas.width = canvasW = width;
        cachedCanvas.height = canvasH = height;

        // generate tile pyramid
        tilesPyramid = generateTilePyramid(canvasOriW, canvasOriH, format);
        
        setCaption(`${data.copyright} | ${data.caption}`)

        wrapper?.addEventListener("wheel", handleWeel);
        wrapper?.addEventListener("pointerdown", handlePointerDown);
        wrapper?.addEventListener("pointerup", handlePointerLeave);
        wrapper?.addEventListener("pointercancel", handlePointerLeave);

        window.addEventListener("resize", handleWindowResize);

        handleWindowResize();
    });
    
    onCleanup(()=> {
        // cleans up images
        images.forEach(img => img.onload = null);
        images = [];

        // cleans up canvas memories
        releaseCanvas(canvas);
        releaseCanvas(cachedCanvas);

        // cleans up event listener
        wrapper?.removeEventListener("wheel", handleWeel);

        wrapper?.removeEventListener("pointermove", handlePointerMove);
        wrapper?.removeEventListener("pointerleave", handlePointerLeave);
        wrapper?.removeEventListener("pointerdown", handlePointerDown);
        wrapper?.removeEventListener("pointerup", handlePointerLeave);
        wrapper?.removeEventListener("pointercancel", handlePointerLeave);

        window.removeEventListener("resize", handleWindowResize);
    })

    function handleWeel(e:WheelEvent): void {
        e.preventDefault();

        const { ratioX, ratioY, offsetX, offsetY } = ratio(e.pageX, e.pageY, canvasW, canvasH);

        if (e.deltaY < 0) {
            canvasW += canvasW * ZOOM_SPEED;
            canvasH += canvasH * ZOOM_SPEED;
        } else {
            canvasW -= canvasW * ZOOM_SPEED;
            canvasH -= canvasH * ZOOM_SPEED;
        }
        protectSize();

        prevX = offsetX - (canvasW * ratioX);
        prevY = offsetY - (canvasH * ratioY);

        zoomCanvas();
    }
    function handlePointerDown(e: PointerEvent): void {
        wrapper?.setPointerCapture(e.pointerId);
        pointers.push({ start: e });
        if (pointers.length == 2) {
            zoomScale = 1; // always reset value
            pinchedDistanceStart = Math.hypot(pointers[0].start!.pageX - pointers[1].start!.pageX, pointers[0].start!.pageY - pointers[1].start!.pageY);
        }
        wrapper?.addEventListener("pointermove", handlePointerMove);
        wrapper?.addEventListener("pointerleave", handlePointerLeave);
    }
    function handlePointerMove(e: PointerEvent): void {
        e.preventDefault();
        
        // update pointer values
        pointers = pointers.map(p => p.start.pointerId == e.pointerId ? { ...p, updated: e } : p);

        if (pointers.length == 1) {
            const oldPointer: Pointer = pointers.find(p => p.start.pointerId == e.pointerId) || { start: e };
            translateX = Math.floor(prevX + e.pageX - oldPointer.start.pageX);
            translateY = Math.floor(prevY + e.pageY - oldPointer.start.pageY);
            redraw();
        } else if (pointers.length == 2 && touchStarted) {

            pinchedDistanceEnd = Math.hypot(pointers[0].updated!.pageX - pointers[1].updated!.pageX, pointers[0].updated!.pageY - pointers[1].updated!.pageY);

            const distanceX:number = Math.abs(pointers[0].start!.pageX - pointers[1].start!.pageX) * .5;
            const distanceY:number = Math.abs(pointers[0].start!.pageY - pointers[1].start!.pageY) * .5;
            const centerX:number = pointers[0].start!.pageX < pointers[1].start!.pageX ? pointers[0].start!.pageX : pointers[1].start!.pageX;
            const centerY:number = pointers[0].start!.pageY < pointers[1].start!.pageY ? pointers[0].start!.pageY : pointers[1].start!.pageY;
            const { ratioX, ratioY, offsetX, offsetY } = ratio((centerX + distanceX), (centerY + distanceY), canvasW, canvasH);

            const tempScale: number = pinchedDistanceEnd / pinchedDistanceStart;
            const scale: number = tempScale / zoomScale;

            zoomScale = tempScale;

            canvasW *= scale;
            canvasH *= scale;
            protectSize();

            prevX = offsetX - (canvasW * ratioX);
            prevY = offsetY - (canvasH * ratioY);

            zoomCanvas();
        }

        if (!touchStarted) touchStarted = true;
    }
    function handlePointerLeave(e: PointerEvent): void {
        if(pointers.length == 1 && touchStarted) {
            const currentPointer: Pointer = pointers.find(p => p.start.pointerId == e.pointerId) || { start: e };
            prevX = Math.floor(prevX + e.pageX - currentPointer.start.pageX);
            prevY = Math.floor(prevY + e.pageY - currentPointer.start.pageY);
        }
        touchStarted = false;
        // remove pointer from cachea
        pointers = pointers.filter(p => p.start.pointerId != e.pointerId);

        // cleans event listener
        wrapper?.removeEventListener("pointermove", handlePointerMove);
        wrapper?.removeEventListener("pointerleave", handlePointerLeave);
    }

    function handleWindowResize(e?:Event) {
        wrapper?.style.setProperty('--height', `${window.innerHeight}px`);

        canvas.width = wrapper?.getBoundingClientRect().width;
        canvas.height = wrapper?.getBoundingClientRect().height;
        const sourceVertical:boolean = cachedCanvas.height / cachedCanvas.width > canvas.height / canvas.width;
        if(e == undefined) {
            if(sourceVertical) {
                canvasH = (canvas?.getBoundingClientRect().height || cachedCanvas.height);
                canvasW = (cachedCanvas.width / cachedCanvas.height) * canvasH;
            } else {
                canvasW = (canvas?.getBoundingClientRect().width || cachedCanvas.width);
                canvasH = (cachedCanvas.height / cachedCanvas.width) * canvasW;

            }
        }

        generateTiles();
        moveToCenter(sourceVertical);
    }

    function moveToCenter(isVertical:boolean): void {
        prevX = (canvas?.getBoundingClientRect().width || cachedCanvas.width) * .5 - (canvasW * .5);
        prevY = isVertical && canvas.height <= canvasH ? 0 : (canvas?.getBoundingClientRect().height || cachedCanvas.height) * .5 - (canvasH * .5);
        translateX = prevX;
        translateY = prevY;

        redraw();
    }

    function protectSize(): void {
        if(canvasH > cachedCanvas.height) canvasH = cachedCanvas.height;
        if(canvasW > cachedCanvas.width) canvasW = cachedCanvas.width;
    }

    function ratio (x: number, y: number, w: number, h: number): TypeRatio {
        const domRect: DOMRect | undefined = wrapper?.getBoundingClientRect();
        const offsetX: number = x - domRect!.left - window.pageXOffset;
        const offsetY: number = y - domRect!.top - window.pageYOffset;

        // Record the offset between the bg edge and cursor:
        const cursorX: number = offsetX - prevX;
        const cursorY: number = offsetY - prevY;

        // Use the previous offset to get the percent offset between the bg edge and cursor:
        return {
            ratioX: cursorX / w,
            ratioY: cursorY / h,
            offsetX,
            offsetY
        };
    };

    function zoomCanvas():void {
        translateX = Math.floor(prevX);
        translateY = Math.floor(prevY);

        generateTiles();
        redraw();
    }

    

    let prevTilePyrnamid:TilePyramid|undefined;
    function generateTiles():void {
        let tile:TilePyramid|undefined = tilesPyramid.find(t => t.canvasWidth * 1.5 >= canvasW);
        if(prevTilePyrnamid && prevTilePyrnamid.pathNum >= tile!.pathNum) return;
        prevTilePyrnamid = tile;

        // reset tiles
        tiles = [];

        // cleans up images
        images.forEach(img => img.onload = null);
        images = [];

        let y:number = 0;
        let lenX:number = tile!.tileXCount;
        let lenY:number = tile!.tileYCount;
        let pathNum:number = tile!.pathNum;
        let lastTileW:number = tile!.canvasWidth % BASED_TILE_SIZE;
        let lastTileH:number = tile!.canvasHeight % BASED_TILE_SIZE;

        while(y < tile!.tileYCount) {
            let x:number = 0;
            
            while(x < lenX) {
                tiles.push({
                    loaded: false,
                    x:x, 
                    y:y,
                    sizeW: (x < lenX - 1 ? BASED_TILE_SIZE : lastTileW),
                    sizeH: (y < lenY - 1 ? BASED_TILE_SIZE : lastTileH),
                    basedNum:pathNum
                });
                x++;
            }
            
            y++;
        }
    }
    
    function loadTiles() {
        if(tiles.length == 0) return;
        let scale:number = 1 / Math.pow(2, prevTilePyrnamid?.pathNum - (format == "dzi" ? 1 : 0));
        // TODO: in case canvas height smaller than based tile size
        if(scale == 1 && (canvas?.height < BASED_TILE_SIZE)) scale = canvasH / canvasOriH;

        let tileSize:number = BASED_TILE_SIZE * scale;

        const viewPort:DOMRect = new DOMRect(0, 0, canvas?.width, canvas?.height);
       
        tiles.forEach((t, y) => {
            
            let intersected = intersect(viewPort, new DOMRect(t.x * tileSize + translateX * scale, t.y * tileSize + translateY * scale, t.sizeW * scale, t.sizeH * scale));
            if(intersected) {
                t.loaded = true;
                let img:HTMLImageElement = new Image()
                img.onload = onImageLoaded;
                switch(format) {
                    default:
                    case "dzi":
                        img.src = `${imageFolder}/${DZI_BASED_PATHNUMBER + t.basedNum}/${t.x}_${t.y}.jpg`;
                        break;
                    case "zoomify":
                        // get folder num
                        let tileNum:number = tilesPyramid.filter(tp => tp.pathNum < t.basedNum).map(tp => tp.tileXCount * tp.tileYCount).reduce((p, c)=>{
                            return p + c;
                        }, 0) + prevTilePyrnamid?.tileXCount * t.y + t.x + 1;
                        img.src = `${imageFolder}/TileGroup${Math.floor(tileNum / BASED_TILE_SIZE)}/${ZOOMIFY_BASED_PATHNUMBER + t.basedNum}-${t.x}-${t.y}.jpg`;
                        break;
                }
                // img.src = format == "dzi" ? `${imageFolder}/${DZI_BASED_PATHNUMBER + t.basedNum}/${t.x}_${t.y}.jpg`: `${imageFolder}/${ZOOMIFY_BASED_PATHNUMBER + t.basedNum}-${t.x}-${t.y}.jpg`;
                // add image to list for clean's up
                images.push(img);
            }
   
        })

        //cleans up loaded
        tiles = tiles.filter(t => !t.loaded);
    }

    function onImageLoaded (e: Event) {

        const img: HTMLImageElement = e.currentTarget as HTMLImageElement;

        const  chars: string[] = img.src.split("/");

        let posChars: string[];
        let posXChars:number;
        let posYChars:number;
        let basedChar: number;
        let basedValue:number

        switch(format) {
            default:
            case "dzi":
                posChars = chars[chars.length - 1].split("_");
                posXChars = parseInt(posChars[0]);
                posYChars = parseInt(posChars[1]);
                basedChar = parseInt(chars[chars.length - 2]);
                basedValue = Math.pow(2, tilesPyramid.length) / Math.pow(2, basedChar-8) * canvasScale;
                break;

            case "zoomify":
                posChars = chars[chars.length - 1].split("-");
                basedChar = parseInt(posChars[0]);
                posXChars = parseInt(posChars[1]);
                posYChars = parseInt(posChars[2]);
                basedValue = Math.pow(2, tilesPyramid.length) / Math.pow(2, basedChar) * canvasScale;
                break;
        }

        if (!canvas) return;

        // update and save to temp canvas
        const x:number = BASED_TILE_SIZE * basedValue * posXChars;
        const y:number = BASED_TILE_SIZE * basedValue * posYChars;
        if(x >= cachedCanvas.width) return;
        if(y >= cachedCanvas.height) return;
        const w:number = img.naturalWidth * basedValue;
        const h:number = img.naturalHeight * basedValue
        cachedCtx?.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, x, y, w, h);
       
        redraw();

        // remove loaded image from list
        images = images.filter(m => m.src == img.src);
    };

    let timeoutID:number;
    function redraw (): void {
        // save canvas size
        var w:number = canvas?.width;
        var h:number = canvas?.height;

        // release memory
        releaseCanvas(canvas);

        // restore canvas size
        canvas!.width = w;
        canvas!.height = h;
        
        context?.drawImage(cachedCanvas, 0, 0, cachedCanvas.width, cachedCanvas.height, translateX, translateY, canvasW, canvasH);

        clearTimeout(timeoutID)
        timeoutID = setTimeout(()=> {
            loadTiles()
        }, timeoutID == undefined ? 1 : 2000);
    };

    return (
        <div ref={wrapper} class="image-wrapper">
            <canvas ref={canvas} width={3499} height={2648}></canvas>
            <div class="caption">{caption()}</div>
        </div>
    );
}

export default ImageZoom;
