# 3D model credits

Every model here is CC0 (public domain): free for commercial use, no attribution required.
We credit the authors anyway.

| File | Source | Author | License |
| --- | --- | --- | --- |
| `characters/*.glb` | [Ultimate Animated Character Pack](https://quaternius.com/packs/ultimatedanimatedcharacter.html) | Quaternius | CC0 1.0 |
| `nature.glb` (CommonTree_1, CommonTree_3, Flowers, Plant_1) | [Ultimate Nature Pack](https://quaternius.com/packs/ultimatenature.html) | Quaternius | CC0 1.0 |
| `city.glb` | [KayKit City Builder Bits 1.0](https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0) | Kay Lousberg | CC0 1.0 |
| `cafe.glb` | [KayKit Restaurant Bits 1.0](https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0) | Kay Lousberg | CC0 1.0 |

## How the files were made

All of them were processed with [glTF Transform](https://gltf-transform.dev) 4.5.
- **Characters:** only the clips the world plays are kept (`Idle`, `Walk`, `Run`, `SitDown`, `StandUp`, `Victory`); the combat clips are removed.
  Then `gltf-transform optimize --compress meshopt --join false --flatten false --instance false --simplify false --palette false`.
  `Doctor_Female_Young.glb` also has a `SeatedCoat` morph keyed in `SitDown` to fold the coat hem onto the cushion.
- **Props:** several source files are packed into one `.glb` per pack, each under a root node named after its source file (for example `building_A`, `chair_A`).
  The world picks pieces by that name (`src/world/Plaza.tsx`).
  Then the same `optimize` command, which keeps those node names.

Meshopt compression is decoded by drei's `useGLTF` out of the box.
