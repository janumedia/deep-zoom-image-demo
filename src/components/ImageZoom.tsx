import { createSignal, onMount } from "solid-js";

const ZOOM_SPEED:number = 0.1;
const BASED_TILE_SIZE:number = 256;

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

interface Tile {
    loaded:boolean,
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
        let len:number = size / BASED_TILE_SIZE;
        
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

function ImageZoom(props:ImageZoomProp) {
    let canvas: HTMLCanvasElement | undefined;
    let wrapper: HTMLDivElement | undefined;
    let context: CanvasRenderingContext2D | null;

    let canvasOriW:number = 0;
    let canvasOriH:number = 0;
    let canvasW: number = canvasOriW;
    let canvasH: number = canvasOriH;

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

    let tiles:Tile[][];
    let images:HTMLImageElement[] = [];
    let tilesPyramid:TilePyramid[];

    const strs:string[] = props.src.split("/");
    let imageFolder:string = strs[strs.length-2];
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
        canvasW = canvasOriW;
        canvasH = canvasOriH;
        cachedCanvas.width = canvasOriW;
        cachedCanvas.height = canvasOriH;
        
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
        canvas.width = wrapper?.getBoundingClientRect().width;
        canvas.height = wrapper?.getBoundingClientRect().height;
        const sourceVertical:boolean = canvasOriH / canvasOriW > canvas.height / canvas.width;
        if(e == undefined) {
            if(sourceVertical) {
                canvasH = (canvas?.getBoundingClientRect().height || canvasOriH);
                canvasW = (canvasOriW / canvasOriH) * canvasH;
            } else {
                canvasW = (canvas?.getBoundingClientRect().width || canvasOriW);
                canvasH = (canvasOriH / canvasOriW) * canvasW;
                
            }
        }

        generateTiles();
        moveToCenter(sourceVertical);
    }

    function moveToCenter(isVertical:boolean): void {
        prevX = (canvas?.getBoundingClientRect().width || canvasOriW) * .5 - (canvasW * .5);
        prevY = isVertical && canvas.height <= canvasH ? 0 : (canvas?.getBoundingClientRect().height || canvasOriW) * .5 - (canvasH * .5);
        translateX = prevX;
        translateY = prevY;

        redraw();
    }

    function protectSize(): void {
        if(canvasH > canvasOriH) canvasH = canvasOriH;
        if(canvasW > canvasOriW) canvasW = canvasOriW;
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

    function redraw (): void {
        canvas!.width = canvas!.width;
        context?.drawImage(cachedCanvas, 0, 0, canvasOriW, canvasOriH, translateX, translateY, canvasW, canvasH);

        loadTiles()
    };

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
            let subTiles:Tile[] = [];
            
            while(x < lenX) {
                subTiles.push({
                    loaded: false,
                    sizeW: (x < lenX - 1 ? BASED_TILE_SIZE : lastTileW),
                    sizeH: (y < lenY - 1 ? BASED_TILE_SIZE : lastTileH),
                    basedNum:pathNum
                });
                x++;
            }
            tiles.push(subTiles)
            y++;
        }
    }

    function loadTiles() {
        
        let scale:number = 1 / Math.pow(2, prevTilePyrnamid?.pathNum - (format == "dzi" ? 1 : 0));
        // TODO: in case canvas height smaller than based tile size
        if(scale == 1 && (canvas?.height < BASED_TILE_SIZE)) scale = canvasH / canvasOriH;

        let tileSize:number = BASED_TILE_SIZE * scale;
        
        const viewPort:DOMRect = new DOMRect(0, 0, canvas?.width, canvas?.height);

        tiles.forEach((ty, y) => {
            ty.forEach((tx, x) => { 
                if(!tx.loaded) {
                    if(tx.loaded) return;
                    
                    let intersected = intersect(viewPort, new DOMRect(x * tileSize + translateX * scale, y * tileSize + translateY * scale, tx.sizeW * scale, tx.sizeH * scale));
                    if(intersected && !tx.loaded) {
                        tx.loaded = true;
                        let img:HTMLImageElement = new Image()
                        img.onload = onImageLoaded
                        img.src = format == "dzi" ? `/images/${imageFolder}/${DZI_BASED_PATHNUMBER + tx.basedNum}/${x}_${y}.jpg`: `/images/${imageFolder}/${ZOOMIFY_BASED_PATHNUMBER + tx.basedNum}-${x}-${y}.jpg`;
                        // add image to list for clean's up
                        images.push(img);
                    }
                }
            })
        })
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
                basedValue = Math.pow(2, tilesPyramid.length) / Math.pow(2, basedChar-8);
                break; 

            case "zoomify":
                posChars = chars[chars.length - 1].split("-");
                basedChar = parseInt(posChars[0]);
                posXChars = parseInt(posChars[1]);
                posYChars = parseInt(posChars[2]);
                basedValue = Math.pow(2, tilesPyramid.length) / Math.pow(2, basedChar);
                break;
        }
        
        if (!canvas) return;

        // update and save to temp canvas
        cachedCtx?.drawImage(img, BASED_TILE_SIZE * basedValue * posXChars, BASED_TILE_SIZE * basedValue * posYChars, img.naturalWidth * basedValue, img.naturalHeight * basedValue);

        redraw();

        // remove loaded image from list
        images = images.filter(m => m.src == img.src);
    };

    return (
        <div ref={wrapper} class="image-wrapper">
            <canvas ref={canvas} width={3499} height={2648}></canvas>
            <div class="caption">{caption()}</div>
        </div>
    );
}

export default ImageZoom;
