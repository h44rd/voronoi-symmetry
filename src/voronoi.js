import { assert } from "hoek";
import { livecanvas } from "./main";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { SobelOperatorShader } from "three/examples/jsm/shaders/SobelOperatorShader";
import { LuminosityShader } from "three/examples/jsm/shaders/LuminosityShader";
import { PostProcessShader } from "./PostProcessShader";

var THREE = require("three");

export class Voronoi2D {

    // :::::::::: Constructor :::::::::: //
    constructor() {
        // :::: THREE.js init stuff :::: //
        this.scene = new THREE.Scene();

        this.frustumSize = 1;
        this.aspect = window.innerWidth / window.innerHeight;
        
        this.camera = new THREE.OrthographicCamera(this.frustumSize * this.aspect / -2, this.frustumSize * this.aspect / 2, this.frustumSize / 2, this.frustumSize / -2);
        this.camera.position.z = 10;
        // this.camera.position.y = -.5;
        this.camera.lookAt(this.scene.position);
        
        this.factor = 1.0;
        this.screenWidth = window.innerWidth * this.factor;
        this.screenHeight = window.innerHeight * this.factor;

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(this.screenWidth, this.screenHeight);
        document.body.appendChild(this.renderer.domElement);

        // :::: Postprocessing :::: //
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // color to grayscale conversion

        // const effectGrayScale = new ShaderPass( LuminosityShader );
        // this.composer.addPass( effectGrayScale );

        // you might want to use a gaussian blur filter before
        // the next pass to improve the result of the Sobel operator

        // Sobel operator

        const effectSobel = new ShaderPass( PostProcessShader );
        effectSobel.uniforms[ 'resolution' ].value.x = window.innerWidth * window.devicePixelRatio;
        effectSobel.uniforms[ 'resolution' ].value.y = window.innerHeight * window.devicePixelRatio;
        this.composer.addPass( effectSobel );

        // :::: Voronoi elements :::: //
        this.colorHue = 47;
        this.colorPrime = 19;

        var geometry = new THREE.PlaneGeometry(10, 10);
        var material = new THREE.MeshBasicMaterial({ color: this.getRandomHueColor(70) });
        this.plane = new THREE.Mesh(geometry, material);
        this.plane.position.z = -3.0;
        this.scene.add(this.plane);

        this.line_divisions = 6;

        this.coneRadius = 0.3;
        this.coneHeight = 1;
        this.coneSegments = 32;

        this.prismGeometry = {};
        this.createPrismGeometry();

        // :::: Data :::: //
        this.voronoi_lines = [];

        this.animate();
    }

    // :::::::::: Rendering :::::::::: //
    render() {
        // this.renderer.render(this.scene, this.camera);
        this.composer.render();
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.render();
    }

    renderLine(line_id, point1, point2) {
        point1 = this.transformCoords(point1);
        point2 = this.transformCoords(point2);

        var point_v1 = new THREE.Vector2(point1[0], point1[1]);
        var point_v2 = new THREE.Vector2(point2[0], point2[1]);
        
       if(this.voronoi_lines[line_id] == null) {
            this.createLine(line_id, point_v1, point_v2);
            this.scene.add(this.voronoi_lines[line_id]['cones'][0]);
            this.scene.add(this.voronoi_lines[line_id]['cones'][1]);
            this.scene.add(this.voronoi_lines[line_id]['prism']);
        }

        if(this.voronoi_lines[line_id]['isHidden'] == true) {
            this.scene.add(this.voronoi_lines[line_id]['cones'][0]);
            this.scene.add(this.voronoi_lines[line_id]['cones'][1]);
            this.scene.add(this.voronoi_lines[line_id]['prism']);

            this.voronoi_lines[line_id]['isHidden'] == false;
        }

        this.modifyLine(line_id, point_v1, point_v2);
    }

    // :::::::::: Utilities :::::::::: //
    getHSLColor(line_id, S) {
        this.colorHue = (this.colorPrime * line_id) % 360;
        var color1 = new THREE.Color("hsl(" + this.colorHue.toString(10) + ", " + S.toString(10) + "%, 70%)");
        return color1;
    }

    getRandomInt(max) {
        return Math.floor(Math.random() * Math.floor(max));
    }
    getRandomHueColor(S) {
        var color1 = new THREE.Color("hsl(" + this.getRandomInt(361).toString(10) + ", " + S.toString(10) + "%, 70%)");
        return color1;
    }

    getLinePoints(point1, point2, n_divisions) {
        var line = [];
        var t = 0;
        
        for(var i = 0; i <= n_divisions; i++) {
            var point2D = new THREE.Vector2(0, 0);
            var point2D_1 = new THREE.Vector2(point1.x, point1.y);
            var point2D_2 = new THREE.Vector2(point2.x, point2.y);
            line.push(point2D.addVectors(point2D_1.multiplyScalar(1 - t), point2D_2.multiplyScalar(t)));
            t += 1.0/n_divisions;
        }
        return line;
    }

    createLine(line_id, point_v1, point_v2) {
        var cone_color = this.color;
        var voronoi_cones = [];
        voronoi_cones.push(this.makeSeed(point_v1, cone_color));
        voronoi_cones.push(this.makeSeed(point_v2, cone_color));

        var voronoi_prism = this.makePrism(point_v1, point_v2, cone_color);
        this.voronoi_lines[line_id] = {
            'id': line_id,
            'color': cone_color,
            'cones': voronoi_cones,
            'prism': voronoi_prism,
            'isHidden': false
        };
    }

    makePrism(point_v1, point_v2, prism_color) {
        var material = new THREE.MeshBasicMaterial({
            color: prism_color,
            polygonOffset: true,
            polygonOffsetFactor: 1, // positive value pushes polygon further away
            polygonOffsetUnits: 1
        });

        var prism = new THREE.Mesh(this.prismGeometry, material);
        prism.position.set(point_v1.x, point_v1.y, 0.0);
        prism.scale.z = point_v1.distanceTo(point_v2);
        prism.rotateX(Math.PI / 2);

        return prism;
    }

    makeSeed(point, cone_color) {
        var geometry = new THREE.ConeGeometry(this.coneRadius, this.coneHeight, this.coneSegments);
        var material = new THREE.MeshBasicMaterial({
            color: cone_color,
            polygonOffset: true,
            polygonOffsetFactor: 1, // positive value pushes polygon further away
            polygonOffsetUnits: 1
        });
        var cone = new THREE.Mesh(geometry, material);

        cone.position.x = point.x;
        cone.position.y = point.y;
        cone.position.z = this.coneHeight / 2;
        cone.rotation.x = Math.PI/2;

        return cone;
    }

    modifyLine(line_id, point_v1, point_v2) {
        assert(this.voronoi_lines[line_id] != null, "Cannot find the line.");
        
        this.voronoi_lines[line_id]['cones'][0].position.set(point_v1.x, point_v1.y, this.coneHeight / 2);
        this.voronoi_lines[line_id]['cones'][1].position.set(point_v2.x, point_v2.y, this.coneHeight / 2);

        var negative_point_v2 = new THREE.Vector2(point_v2.x, point_v2.y);
        negative_point_v2.negate();
        var vec1_2 = new THREE.Vector2();
        vec1_2.addVectors(point_v1, negative_point_v2);
        this.voronoi_lines[line_id]['prism'].rotation.y = Math.atan(vec1_2.y / vec1_2.x) + Math.PI / 2;
        if(vec1_2.x >= 0) {
            this.voronoi_lines[line_id]['prism'].rotation.y += Math.PI;
        }
        this.voronoi_lines[line_id]['prism'].scale.z = point_v1.distanceTo(point_v2);
        this.voronoi_lines[line_id]['prism'].position.set(point_v1.x, point_v1.y, 0);
    }

    hideLine(line_id) {
        if(this.voronoi_lines[line_id] != null && this.voronoi_lines[line_id]['isHidden'] == false) {
            for(var i = 0; i < this.voronoi_lines[line_id]['cones'].length; i++) {
                this.scene.remove(this.voronoi_lines[line_id]['cones'][i]);
            }
            this.scene.remove(this.voronoi_lines[line_id]['prism']);
            this.voronoi_lines[line_id]['isHidden'] = true;
        }
    }

    transformCoords(point) {
        let rect = livecanvas.getBoundingClientRect();
        point[0] += rect.left;
        point[1] += rect.top;
        var x = -1 * (this.screenWidth/2 - point[0]) * this.frustumSize * this.aspect / this.screenWidth;
        var y = (this.screenHeight/2 - point[1]) * this.frustumSize / this.screenHeight;
        return [x, y];
    }

    removeAllObjects() {
        while(this.voronoi_lines.length) {
            // console.log(this.voronoi_lines[this.voronoi_lines.length - 1]);
            this.voronoi_lines.pop();
        }
    }

    setNewColor(line_id) {
        this.color = this.getHSLColor(line_id, 70);
        // console.log("New color", this.color);
    }

    resetColor() {
        this.colorHue = 47;
    }

    createPrismGeometry() {
        var shape = new THREE.Shape();
        shape.moveTo(-1 * this.coneRadius, 0);
        shape.lineTo(0, this.coneHeight);
        shape.lineTo(this.coneRadius, 0);
        shape.lineTo(-1 * this.coneRadius, 0);

        this.prismGeometry = new THREE.ExtrudeGeometry(shape, {amount: 1, bevelEnabled: false});
    }
}