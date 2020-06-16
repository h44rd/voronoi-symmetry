import { assert } from "hoek";
import { livecanvas } from "./main";

var THREE = require("three");

export class Voronoi2D {

    // :::::::::: Constructor :::::::::: //
    constructor() {
        // :::: THREE.js init stuff :::: //
        this.scene = new THREE.Scene();

        this.frustumSize = 1;
        this.aspect = window.innerWidth / window.innerHeight;
        
        this.camera = new THREE.OrthographicCamera(this.frustumSize * this.aspect / -2, this.frustumSize * this.aspect / 2, this.frustumSize / 2, this.frustumSize / -2);
        this.camera.position.z = 1000;
        this.camera.lookAt(this.scene.position);
        
        this.factor = 1.0;
        this.screenWidth = window.innerWidth * this.factor;
        this.screenHeight = window.innerHeight * this.factor;

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(this.screenWidth, this.screenHeight);
        document.body.appendChild(this.renderer.domElement);

        // :::: Voronoi elements :::: //
        this.colorHue = 47;
        this.colorPrime = 17;

        var geometry = new THREE.PlaneGeometry(10, 10);
        var material = new THREE.MeshBasicMaterial({ color: this.getRandomHueColor(70) });
        this.plane = new THREE.Mesh(geometry, material);
        this.plane.position.z = -3.0;
        this.scene.add(this.plane);

        this.line_divisions = 6;

        this.coneRadius = 0.3;
        this.coneHeight = 1;
        this.coneSegments = 32;

        // :::: Data :::: //
        this.voronoi_lines = [];
        this.isLineHidder = [];

        this.animate();
    }

    // :::::::::: Rendering :::::::::: //
    render() {
        this.renderer.render(this.scene, this.camera);
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
        
        // console.log(this.voronoi_lines[line_id]);
        if(this.voronoi_lines[line_id] == null) {
            // this.setNewColor();
            this.createLine(line_id, point_v1, point_v2);
            for(var i = 0; i < this.voronoi_lines[line_id]['cones'].length; i++) {
                this.scene.add(this.voronoi_lines[line_id]['cones'][i]);
            }
            // console.log(line_id, point_v1, point_v2);
        }

        if(this.voronoi_lines[line_id]['isHidden'] == true) {
            for(var i = 0; i < this.voronoi_lines[line_id]['cones'].length; i++) {
                this.scene.add(this.voronoi_lines[line_id]['cones'][i]);
            }
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
        // console.log("creating line:", line_id, this.color);
        var voronoi_cones = []
        var line_points = this.getLinePoints(point_v1, point_v2, this.line_divisions);
        var cone_color = this.color;
        for(var i = 0; i < line_points.length; i++) {
            var cone_mesh = this.makeSeed(line_points[i], cone_color);
            voronoi_cones.push(cone_mesh);
        }
        this.voronoi_lines[line_id] = {
            'id': line_id,
            'color': cone_color,
            'divisions': this.line_divisions,
            'cones': voronoi_cones,
            'isHidden': false
        };
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
        cone.rotation.x = Math.PI/2;

        return cone;
    }

    modifyLine(line_id, point_v1, point_v2) {
        assert(this.voronoi_lines[line_id] != null, "Cannot find the line.");

        var line_points = this.getLinePoints(point_v1, point_v2, this.voronoi_lines[line_id]['divisions']);
        for(var i = 0; i < this.voronoi_lines[line_id]['cones'].length; i++) {
            this.voronoi_lines[line_id]['cones'][i].position.set(line_points[i].x, line_points[i].y, 0);
        }
    }

    hideLine(line_id) {
        if(this.voronoi_lines[line_id] != null && this.voronoi_lines[line_id]['isHidden'] == false) {
            for(var i = 0; i < this.voronoi_lines[line_id]['cones'].length; i++) {
                this.scene.remove(this.voronoi_lines[line_id]['cones'][i]);
            }
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
}