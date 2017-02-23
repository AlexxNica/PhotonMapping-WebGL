/**
 * Created by nidin on 2017-02-18.
 */

export class Triangle {
    constructor(public positions: Vector3[],
                public normals: Vector3[],
                public texcoords: Vector2[],
                public bbox: BBox,
                public centroid: Vector3,
                public idMaterial: number) {
    }
}

export class Material {
    constructor(public name?: string,
                public color: Vector3 = new Vector3(),
                public brdf: number=0,
                public eta: number=0,
                public specularity: number=0,
                public Ka?: Vector3, public Kd?: Vector3, public Ks?: Vector3,
                public Ns?: number,
                public isTextured: boolean=false,
                public texture?: Uint8Array,
                public textureWidth?: number,
                public textureHeight?: number) {
    }
}

export class Mesh {
    constructor(public triangles: Triangle[],
                public materials: Material[],
                public lightsCDF: Float32Array,
                public lightsIndices: Int32Array,
                public lightsArea: number,
                public bbox: BBox) {

    }

    //public LoadOBJ(char* fileName, Vector3 position, float scale),
    public calculateBBox() {
        this.bbox.initialize();
        for (let i = 0; i < this.triangles.length; i++) {
            this.triangles[i].bbox.initialize();
            this.triangles[i].bbox.expand(this.triangles[i].positions[0]);
            this.triangles[i].bbox.expand(this.triangles[i].positions[1]);
            this.triangles[i].bbox.expand(this.triangles[i].positions[2]);

            this.triangles[i].centroid = this.triangles[i].positions[0].add(this.triangles[i].positions[1]).add(this.triangles[i].positions[2]).mulScalar(1.0 / 3.0);

            this.bbox.expand(this.triangles[i].positions[0]);
            this.bbox.expand(this.triangles[i].positions[1]);
            this.bbox.expand(this.triangles[i].positions[2]);
        }
    }

    public prepareLightSources() {
        this.lightsArea = 0.0;
        let lightsCDF = [];
        let lightsIndices = [];

        for (let i: number = 0; i < this.triangles.length; i++) {
            if (this.materials[this.triangles[i].idMaterial].brdf == -1) {
                let Edge0: Vector3 = this.triangles[i].positions[1].sub(this.triangles[i].positions[0]);
                let Edge1: Vector3 = this.triangles[i].positions[2].sub(this.triangles[i].positions[0]);
                let a: number = 0.5 * Edge0.op_remainder(Edge1).length();
                lightsCDF.push(a);
                lightsIndices.push(i);
                this.lightsArea += a;
            }
        }

        this.lightsCDF = new Float32Array(lightsCDF);
        this.lightsIndices = new Int32Array(lightsIndices);

        if (lightsCDF.length == 0) return;

        for (let i: number = 1; i < this.lightsCDF.length; i++) {
            this.lightsCDF[i] = this.lightsCDF[i] + this.lightsCDF[i - 1];
        }

        for (let i: number = 0; i < this.lightsCDF.length; i++) {
            this.lightsCDF[i] = this.lightsCDF[i] / this.lightsArea;
        }
    }

    public release() {
        this.triangles = null;
        this.materials = null;
    }

    public load(mesh:THREE.Mesh, position:Vector3, scale:number)
    {

        let vertices = mesh.geometry.attributes.position.array;
        let normals = mesh.geometry.attributes.normal ? mesh.geometry.attributes.normal.array: null;
        let texcoords = mesh.geometry.attributes.uv ? mesh.geometry.attributes.uv.array:null;
        let indicesAttr = mesh.geometry.getIndex();
        let indices:Uint32Array = indicesAttr?indicesAttr.array:null;

        let haveLightSource:boolean = false;
        // this.triangles.resize(nIndices / 3);
        this.triangles = [];

        if (mesh.material != null)
        {
            for (let i:number = 0; i < mtls.length; i++)
            {
                this.materials.push(mtls[i]);
                if (mtls[i].isTextured)
                {
                    this.materials[i].texture.clear();
                    for (let j = 0; j < mtls[i].texture.length; j++)
                    {
                        this.materials[i].texture.push(mtls[i].texture[j]);
                    }
                }
            }
            for (let i:number = 0; i < mtls.length; i++)
            {
                // Lambertian
                this.materials[i].brdf = 0;
                this.materials[i].eta = 1.7;
                this.materials[i].specularity = 1.0;

                if (mtls[i].Ns == 100.0)
                {
                    if (mtls[i].Ks.dot(mtls[i].Ks) == 3.0)
                    {
                        // mirror
                        this.materials[i].brdf = 1;
                    }
                    else if (mtls[i].Ks.dot(mtls[i].Ks) > 0.0)
                    {
                        // plastic
                        this.materials[i].brdf = 3;
                    }
                }
                else
                {
                    this.materials[i].specularity = Math.max(mtls[i].Ns / 100.0, 0.5);
                    if (mtls[i].Ks.dot(mtls[i].Ks) == 3.0)
                    {
                        // glossy mirror
                        this.materials[i].brdf = 4;
                    }
                    else if (mtls[i].Ks.dot(mtls[i].Ks) > 0.0)
                    {
                        // glossy plastic
                        this.materials[i].brdf = 6;
                    }
                }

                if (mtls[i].name.compare(0, 5, "glass", 0, 5) == 0)
                {
                this.materials[i].eta = mtls[i].Ks.dot(mtls[i].Ks) / 3.0 + 1.0;
                    if (mtls[i].Ns == 100.0)
                    {
                        // glass
                        this.materials[i].brdf = 2;
                    }
                    else
                    {
                        // glossy glass
                        this.materials[i].specularity = Math.max(mtls[i].Ns / 100.0, 0.5);
                        this.materials[i].brdf = 5;
                    }
                }

                if (mtls[i].Ka.dot(mtls[i].Ka) > 0.0)
                {
                    // light source
                    this.materials[i].brdf = -1;
                    haveLightSource = true;
                }

                if ((this.materials[i].brdf == 0) || (this.materials[i].brdf == 3))
                {
                    mtls[i].Kd = mtls[i].Kd * 0.9;
                }

                if ((this.materials[i].brdf == 2) || (this.materials[i].brdf == 5))
                {
                    mtls[i].Kd.x = sqrtf(mtls[i].Kd.x);
                    mtls[i].Kd.y = sqrtf(mtls[i].Kd.y);
                    mtls[i].Kd.z = sqrtf(mtls[i].Kd.z);
                }

                this.materials[i].color = mtls[i].Kd;

                if (mtls[i].name.compare(0, 3, "sss", 0, 3) == 0)
                {
                    this.materials[i].brdf = 7;
                }
            }
        }
        else
        {
            // use default
            let mtl:Material = new Material();
            mtl.isTextured = false;
            mtl.brdf = 0;
            mtl.Kd = new Vector3(0.75, 0.75, 0.75);
            this.materials.push(mtl);
        }

        for (let i:number = 0; i < this.triangles.length; i++)
        {
            const v0 = indices[i * 3];
            const v1 = indices[i * 3 + 1];
            const v2 = indices[i * 3 + 2];

            this.triangles[i].positions[0] = new Vector3(vertices[v0 * 3], vertices[v0 * 3 + 1], vertices[v0 * 3 + 2]);
            this.triangles[i].positions[1] = new Vector3(vertices[v1 * 3], vertices[v1 * 3 + 1], vertices[v1 * 3 + 2]);
            this.triangles[i].positions[2] = new Vector3(vertices[v2 * 3], vertices[v2 * 3 + 1], vertices[v2 * 3 + 2]);
            this.triangles[i].positions[0] = this.triangles[i].positions[0] * scale + position;
            this.triangles[i].positions[1] = this.triangles[i].positions[1] * scale + position;
            this.triangles[i].positions[2] = this.triangles[i].positions[2] * scale + position;

            if (normals != null)
            {
                this.triangles[i].normals[0] = new Vector3(normals[v0 * 3], normals[v0 * 3 + 1], normals[v0 * 3 + 2]);
                this.triangles[i].normals[1] = new Vector3(normals[v1 * 3], normals[v1 * 3 + 1], normals[v1 * 3 + 2]);
                this.triangles[i].normals[2] = new Vector3(normals[v2 * 3], normals[v2 * 3 + 1], normals[v2 * 3 + 2]);
            }
            else
            {
                // no normal data, calculate the normal for a polygon
                const Vector3 e0 = this.triangles[i].positions[1] - this.triangles[i].positions[0];
                const Vector3 e1 = this.triangles[i].positions[2] - this.triangles[i].positions[0];
                const Vector3 n = (e0 % e1).normalize();

                this.triangles[i].normals[0] = n;
                this.triangles[i].normals[1] = n;
                this.triangles[i].normals[2] = n;
            }

            // material id
            this.triangles[i].idMaterial = 0;
            if (matid != null)
            {
                // read texture coordinates
                if ((texcoords != null) && mtls[matid[i]].isTextured)
                {
                    this.triangles[i].texcoords[0] = new Vector2(texcoords[v0 * 2], texcoords[v0 * 2 + 1]);
                    this.triangles[i].texcoords[1] = new Vector2(texcoords[v1 * 2], texcoords[v1 * 2 + 1]);
                    this.triangles[i].texcoords[2] = new Vector2(texcoords[v2 * 2], texcoords[v2 * 2 + 1]);
                }
                else
                {
                    this.triangles[i].texcoords[0] = new Vector2(1.0e+30, 1.0e+30);
                    this.triangles[i].texcoords[1] = new Vector2(1.0e+30, 1.0e+30);
                    this.triangles[i].texcoords[2] = new Vector2(1.0e+30, 1.0e+30);
                }

                this.triangles[i].idMaterial = matid[i];
            }
            else
            {
                this.triangles[i].texcoords[0] = new Vector2(1.0e+30, 1.0e+30);
                this.triangles[i].texcoords[1] = new Vector2(1.0e+30, 1.0e+30);
                this.triangles[i].texcoords[2] = new Vector2(1.0e+30, 1.0e+30);
            }
        }

        this.CalculateBBox();
        if (haveLightSource) this.PrepareLightSources();

        delete[] vertices;
        delete[] normals;
        delete[] texcoords;
        delete[] indices;
        delete[] matid;
    }
}