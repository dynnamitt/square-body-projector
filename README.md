# square-body-projector 

Webpage utilizing WebGL/Tree.js.

Given selection of 2d svg set that has a group of vertix/edges "annoted" for z-axis projection,
fast-xml-parser produced a list of vertix+edges as input from SVG XML

## Sample (box with a window)

                                           n---------n
                                          /        / |
    *--------*                           *--------*  |             
    |  x..x  |                           |  x..x  |  |
    |  .  .  |  -- |projected-as-3d| --> |  .  .  |  n
    |  x..x  |                           |  x..x  | / 
    *--------*                           *--------*

### Legend
1. '*' vertix and '--" edges in a poly-group (or layer) that trigger a copy placed behind in in z-aksis. 'n' shows new clone of vertix
2. n vertixes gets z pos +WIDTH const
3. edges+faces in 3d space is then added between '*' and 'n' vertix
4. 'x' vertix keep its z pos = 0, '..' edge follow along, no projection added

## Future iterations

- Multiple layers of poly-group making complex connecting faces
