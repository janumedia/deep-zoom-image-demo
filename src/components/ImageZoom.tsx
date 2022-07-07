import { onMount } from "solid-js";

const ZOOM_SPEED:number = 0.1;
const BASED_TILE_SIZE:number = 256;
const threshold:number = 10; // minimum area tile showing up for loading image

const MIN_CANVAS_SIZE:number = BASED_TILE_SIZE * 2;
const BASED_PATHNUMBER:number = 9;

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
    x:number,
    y:number,
    size:number,
    basedNum:number
}

interface ImageZoomProp {
    src:string
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
    let translateX: number = 0;
    let translateY: number = 0;
    let zoomScale: number = 1;

    let pointers: Pointer[] = [];
    let pinchedDistanceStart: number = 0;
    let pinchedDistanceEnd: number = 0;
    let touchStarted: boolean = false;

    let tiles:Tile[][];
    let prevNumTileX:number = 0;
    let images:HTMLImageElement[] = [];

    const strs:string[] = props.src.split("/");
    let imageFolder:string = strs[strs.length-2];

    onMount(async() => {
        // set canvas context
        context = canvas!.getContext("2d");
        
        // get image data
        const data = await fetch(props.src).then(res => res.json());
        canvasOriW = data.width;
        canvasOriH = data.height;
        canvasW = canvasOriW;
        canvasH = canvasOriH;
        cachedCanvas.width = canvasOriW;
        cachedCanvas.height = canvasOriH;

        wrapper?.addEventListener("wheel", handleWeel);
        wrapper?.addEventListener("pointerdown", handlePointerDown);
        wrapper?.addEventListener("pointerup", handlePointerLeave);
        wrapper?.addEventListener("pointercancel", handlePointerLeave);

        window.addEventListener("resize", handleWindowResize);
        
        handleWindowResize();
    });

    function handleWeel(e:WheelEvent) {
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

        translateX = Math.floor(prevX);
        translateY = Math.floor(prevY);
        redraw();
    }
    function handlePointerDown(e: PointerEvent) {
        wrapper?.setPointerCapture(e.pointerId);
        pointers.push({ start: e });
        if (pointers.length == 2) {
            zoomScale = 1; // always reset value
            pinchedDistanceStart = Math.hypot(pointers[0].start!.pageX - pointers[1].start!.pageX, pointers[0].start!.pageY - pointers[1].start!.pageY);
        }
        wrapper?.addEventListener("pointermove", handlePointerMove);
        wrapper?.addEventListener("pointerleave", handlePointerLeave);
    }
    function handlePointerMove(e: PointerEvent) {
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

            translateX = Math.floor(prevX);
            translateY = Math.floor(prevY);
            redraw();
        }

        if (!touchStarted) touchStarted = true;
    }
    function handlePointerLeave(e: PointerEvent) {
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

    function moveToCenter(isVertical:boolean) {
        const scale:number = canvasW / canvasOriW;
        prevX = (canvas?.getBoundingClientRect().width || canvasOriW) * .5 - (canvasW * .5);
        prevY = isVertical && canvas.height <= canvasH ? 0 : (canvas?.getBoundingClientRect().height || canvasOriW) * .5 - (canvasH * .5);
        translateX = prevX;
        translateY = prevY;

        redraw();
    }

    function protectSize() {
        if(canvasH > canvasOriH) canvasH = canvasOriH;
        if(canvasW > canvasOriW) canvasW = canvasOriW;

        generateTiles();
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

    function redraw () {
        canvas!.width = canvas!.width;
        context?.drawImage(cachedCanvas, 0, 0, canvasOriW, canvasOriH, translateX, translateY, canvasW, canvasH);

        loadTiles()
    };

    function generateTiles() {

        let based:number = canvasW <= MIN_CANVAS_SIZE ? 4 : canvasW <= MIN_CANVAS_SIZE * 2 ? 2 : 1;
        let scale:number =  canvasW / canvasOriW;
        let tileSize:number = canvasW < canvasOriW ? BASED_TILE_SIZE * based * scale : BASED_TILE_SIZE;
        let extraTileX:number = canvasW % tileSize > 0 ? 1 : 0;
        let numTilesX:number = Math.floor(canvasW / tileSize) + extraTileX;
        let extraTileY:number = canvasH % tileSize > 0 ? 1 : 0;
        let numTilesY:number = Math.floor(canvasH / tileSize) + extraTileY;
        let basedNum:number = BASED_PATHNUMBER + Math.floor(canvasW / 2 / tileSize);

        // only generate if will generate more tiles
        if(numTilesX <= prevNumTileX) return; 
        prevNumTileX = numTilesX;

        // cleans up images
        images.forEach(img => img.onload = null);
        images = [];

        // reset tiles
        tiles = [];

        let y:number = 0;
        while(y < numTilesY) {
            let x:number = 0;
            let subTiles:Tile[] = [];
            while(x < numTilesX) {
                subTiles.push({
                    loaded: false,
                    x: x * tileSize,
                    y: y * tileSize,
                    size: tileSize,
                    basedNum
                });
                x++;
            }
            tiles.push(subTiles)
            y++;
        }
        console.log(basedNum, "make tiles", tiles[0].length)
    }

    function loadTiles() {

        if(!tiles || tiles.length < 1) return;
        
        let underlapH:number = translateX > 0 ? 0 : Math.abs(translateX);
        let overlapH:number = translateX + canvasW - canvas?.width;
        overlapH = overlapH < 0 ? 0 : overlapH;
        let maxH:number = canvasW - overlapH
    
        let underlapV:number = translateY > 0 ? 0 : Math.abs(translateY);
        let overlapV:number = translateY + canvasH - canvas?.height;
        overlapV = overlapV < 0 ? 0 : overlapV;
        let maxV:number = canvasH - overlapV;

        let scale:number =  canvasW / canvasOriW;
        let tileSize:number = BASED_TILE_SIZE * 4 * scale;

        tiles.forEach((ty, y) => {
            ty.forEach((tx, x) => {
                if(!tx.loaded) {
                    let passedX:boolean = tx.x + tileSize > underlapH && tx.x + threshold <= maxH;
                    let passedY:boolean = tx.y + tx.size > underlapV && tx.y + threshold <= maxV;
                    
                    if(passedX && passedY && !tx.loaded) {
                        tx.loaded = true;
                        let img = new Image()
                        img.onload = onImageLoaded;
                        img.src = `/images/${imageFolder}/${tx.basedNum}/${x}_${y}.jpg`;

                        images.push(img);
                    }
                }
            })
        })
    }

    function onImageLoaded (e: Event) {

        const img: HTMLImageElement = e.currentTarget as HTMLImageElement;

        // DZI (deep zoom image format)
        const chars: string[] = img.src.split("/");
        const basedChar: number = parseInt(chars[chars.length - 2]);
        const posChars: string[] = chars[chars.length - 1].split("_");
        const posXChars: number = parseInt(posChars[0]);
        const posYChars: number = parseInt(posChars[1]);
        const basedValue: number = basedChar <= 9 ? 4 : basedChar < 11 ? 2 : 1;

        if (!canvas) return;

        // update and save to temp canvas
        cachedCtx?.drawImage(img, BASED_TILE_SIZE * basedValue * posXChars, BASED_TILE_SIZE * basedValue * posYChars, img.naturalWidth * basedValue, img.naturalHeight * basedValue);

        redraw();

        // remove loaded image from list
        images = images.filter(m => m.src == img.src);
    };

    return (
        <div ref={wrapper} class="image-wrapper">
            <canvas ref={canvas} width={canvasOriW} height={canvasOriH}></canvas>
        </div>
    );
}

export default ImageZoom;
