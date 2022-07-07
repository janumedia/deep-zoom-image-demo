import { onMount } from "solid-js";

const canvasW:number = 1164;
const canvasH:number = 1579;

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

function ImageZoom() {
    let canvas: HTMLCanvasElement | undefined;
    let wrapper: HTMLDivElement | undefined;
    let context: CanvasRenderingContext2D | null;

    // cached canvas
    // use to saved original rendered canvas
    let cachedCanvas: HTMLCanvasElement = document.createElement("canvas");
    cachedCanvas.width = canvasW;
    cachedCanvas.height = canvasH;
    let cachedCtx: CanvasRenderingContext2D | null = cachedCanvas.getContext("2d");

    let cW: number = canvasW;
    let cH: number = canvasH;

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

    onMount(() => {
        // set canvas context
        context = canvas!.getContext("2d");

        wrapper!.addEventListener("wheel", e => {
            e.preventDefault();

            const { ratioX, ratioY, offsetX, offsetY } = ratio(e.pageX, e.pageY, cW, cH);

            if (e.deltaY < 0) {
                cW += cW * ZOOM_SPEED;
                cH += cH * ZOOM_SPEED;
            } else {
                cW -= cW * ZOOM_SPEED;
                cH -= cH * ZOOM_SPEED;
            }
            protectSize();

            prevX = offsetX - (cW * ratioX);
            prevY = offsetY - (cH * ratioY);

            translateX = Math.floor(prevX);
            translateY = Math.floor(prevY);
            redraw();
        });
        wrapper?.addEventListener("pointerdown", e => {
            wrapper?.setPointerCapture(e.pointerId);
            pointers.push({ start: e });
            if (pointers.length == 2) {
                zoomScale = 1; // always reset value
                pinchedDistanceStart = Math.hypot(pointers[0].start!.pageX - pointers[1].start!.pageX, pointers[0].start!.pageY - pointers[1].start!.pageY);
            }
            wrapper?.addEventListener("pointermove", handlePointerMove);
            wrapper?.addEventListener("pointerleave", handlePointerLeave);
        });
        wrapper?.addEventListener("pointerup", handlePointerLeave);
        wrapper?.addEventListener("pointercancel", handlePointerLeave);

        window.addEventListener("resize", handleWindowResize);

        handleWindowResize();
    });

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
            const { ratioX, ratioY, offsetX, offsetY } = ratio((centerX + distanceX), (centerY + distanceY), cW, cH);

            const tempScale: number = pinchedDistanceEnd / pinchedDistanceStart;
            const scale: number = tempScale / zoomScale;

            zoomScale = tempScale;

            cW *= scale;
            cH *= scale;
            protectSize();

            prevX = offsetX - (cW * ratioX);
            prevY = offsetY - (cH * ratioY);

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
        const sourceVertical:boolean = canvasH / canvasW > canvas.height / canvas.width;
        if(e == undefined) {
            if(sourceVertical) {
                cH = (canvas?.getBoundingClientRect().height || canvasH);
                cW = (canvasW / canvasH) * cH;
            } else {
                cW = (canvas?.getBoundingClientRect().width || canvasW);
                cH = (canvasH / canvasW) * cW;
                
            }
        }

        generateTiles();
        moveToCenter(sourceVertical);
    }

    function moveToCenter(isVertical:boolean) {
        const scale:number = cW / canvasW;
        prevX = (canvas?.getBoundingClientRect().width || canvasW) * .5 - (cW * .5);
        prevY = isVertical && canvas.height <= cH ? 0 : (canvas?.getBoundingClientRect().height || canvasW) * .5 - (cH * .5);
        translateX = prevX;
        translateY = prevY;

        redraw();
    }

    function protectSize() {
        if(cH > canvasH) cH = canvasH;
        if(cW > canvasW) cW = canvasW;

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
        context?.drawImage(cachedCanvas, 0, 0, canvasW, canvasH, translateX, translateY, cW, cH);

        loadTiles()
    };

    function generateTiles() {

        let based:number = cW <= MIN_CANVAS_SIZE ? 4 : cW <= MIN_CANVAS_SIZE * 2 ? 2 : 1;
        let scale:number =  cW / canvasW;
        let tileSize:number = cW < canvasW ? BASED_TILE_SIZE * based * scale : BASED_TILE_SIZE;
        let extraTileX:number = cW % tileSize > 0 ? 1 : 0;
        let numTilesX:number = Math.floor(cW / tileSize) + extraTileX;
        let extraTileY:number = cH % tileSize > 0 ? 1 : 0;
        let numTilesY:number = Math.floor(cH / tileSize) + extraTileY;
        let basedNum:number = BASED_PATHNUMBER + Math.floor(cW / 2 / tileSize);

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
        
        let underlapX:number = translateX > 0 ? 0 : Math.abs(translateX);
        let overlapX:number = translateX + cW - canvas?.width;
        overlapX = overlapX < 0 ? 0 : overlapX;
        let visibleX:number = cW - overlapX
    
        let underlapY:number = translateY > 0 ? 0 : Math.abs(translateY);
        let overlapY:number = translateY + cH - canvas?.height;
        overlapY = overlapY < 0 ? 0 : overlapY;
        let visibleY:number = cH - overlapY;

        let scale:number =  cW / canvasW;
        let tileSize:number = BASED_TILE_SIZE * 4 * scale;

        tiles.forEach((ty, y) => {
            ty.forEach((tx, x) => {
                if(!tx.loaded) {
                    let passedX:boolean = tx.x + tileSize > underlapX && tx.x + threshold <= visibleX;
                    let passedY:boolean = tx.y + tx.size > underlapY && tx.y + threshold <= visibleY;
                    
                    if(passedX && passedY && !tx.loaded) {
                        tx.loaded = true;
                        let img = new Image()
                        img.onload = onImageLoaded;
                        img.src = `/images/TM-10016388/${tx.basedNum}/${x}_${y}.jpg`;

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
        <>
            <h3>Image Zoom</h3>
            <div ref={wrapper} class="image-wrapper">
                <canvas ref={canvas} width={canvasW} height={canvasH}></canvas>
            </div>
        </>
    );
}

export default ImageZoom;
