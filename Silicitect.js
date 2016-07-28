// float arrays?
// reuse memory
// add different cost functions than shannon entropy
// restructure classes
// optimise? extra matrix random method
// split the whole backward thingy

var temperature = 1.0;
var reguliser = 0.000001;
var learningRate = 0.001;
var clipValue = 5.0;
var letterEmbedSize = 5;
var decayRate = 0.96;

var running = false;
var letterCount = 30;
var iterationsPerFrame = 100;
var sampleSize = 10;
var samplePrime = "a";
var totalIterations = 0;

var characterSet = "predefined";
var layers = [];
var text = "";
var letterToIndex = {};
var model = {};
var lastWeights = {};
var recordBackprop = false;
var backprop = [];
var characters = "";

function init (e) {
	
	text = e.responseText;
	
	if (characterSet == "predefined") {
		
		characters = "!@#$%^&*()_+{}\":|?><~±§¡€£¢∞œŒ∑´®†¥øØπ∏¬˚∆åÅßΩéúíóáÉÚÍÓÁëüïöäËÜÏÖÄ™‹›ﬁﬂ‡°·—≈çÇ√-=[];',.\\/`µ≤≥„‰◊ˆ˜¯˘¿⁄\n\t" + 
					"1234567890 ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
		
		for (var a = 0; a < characters.length; a++) {
			
			letterToIndex[characters.charAt(a)] = a;
			
		}
		
		for (var a = 0; a < text.length; a++) {
			
			if (!(1 + letterToIndex[text.charAt(a)])) {
				
				console.log("Wrong character found, " + text.charAt(a) + " not in " + characterSet);
				return;
				
			}
			
		}
		
	} else if (characterSet == "analyse") {
		
		for (var a = 0; a < text.length; a++) {
			
			var char = text.charAt(a);
			
			if (1 + letterToIndex[char]) continue;
			
			letterToIndex[char] = characters.length;
			characters += char;
			
		}
		
	} else {
		
		console.log("Wrong character set specified");
		return;
		
	}
	
	layers = [characters.length, 10, characters.length];
	
	initModel("lstm");
	
}

function updateWeights () {
	
	for (var a in model) {
		
		if (!lastWeights[a]) lastWeights[a] = new Matrix(model[a].n, model[a].d);
		
		var ma = model[a];
		var mb = lastWeights[a];
		
		for (var b = 0; b < ma.w.length; b++) {
			
			mb.w[b] = mb.w[b] * decayRate + (1 - decayRate) * ma.dw[b] * ma.dw[b];
			
			var clippedValue = Math.max(-clipValue, Math.min(clipValue, ma.dw[b]));
			
			ma.w[b] += -learningRate * clippedValue / Math.sqrt(mb.w[b] + 1e-8) - reguliser * ma.w[b];
			ma.dw[b] = 0;
			
		}
		
	}
	
}

function start (lc, it, ss, sp) {
	
	running = true;
	
	if (lc) letterCount = lc;
	if (it) iterationsPerFrame = it;
	if (ss) sampleSize = ss;
	if (sp) samplePrime = sp;
	
}

function stop () {
	
	running = false;
	
}

function save (name) {
	
	Stecy.locallySave("silicitect network " + name, JSON.stringify(model));
	
}

function load (name) {
	
	model = JSON.parse(Stecy.locallyRetrieve("silicitect network " + name));
	
}

function doNetworkStuff () {
	
	if (!running) return;
	
	var startTime = new Date();
	var averageLoss = 0;
	var sentence = "";
	
	for (var a = 0; a < iterationsPerFrame; a++) {
		
		sentence = text.substr(Math.floor(Math.random() * (text.length - letterCount)), letterCount);
		
		averageLoss += train(sentence);
		
	}
	
	totalIterations += iterationsPerFrame;
	
	console.log(totalIterations, (averageLoss / iterationsPerFrame).toFixed(2), (new Date() - startTime) + "ms", ask(sampleSize, samplePrime));
	
}

Stecy.sequence("update", [doNetworkStuff]);

function ask (length, prime) {
	
	recordBackprop = false;
	
	var sentence = prime;
	var log = 0;
	var previous = {};
	var forward = {};
	
	for (var a = 0; a < prime.length; a++) {
		
		var letter = letterToIndex[prime.charAt(a)];
		
		forward = forwardLSTM(letter, previous);
		previous = forward;
		
	}
	
	for (var a = 0; a < length; a++) {
		
		var inputLetter = letterToIndex[sentence.charAt(sentence.length - 1)];
		
		forward = forwardLSTM(inputLetter, previous);
		previous = forward;
		
		for (var b = 0; b < forward.o.w.length; b++) {
			
			forward.o.w[b] /= temperature;
			
		}
		
		var probabilities = softmax(forward.o);
		var index = sampler(probabilities.w);
		
		sentence += characters.charAt(index);
		
	}
	
	return sentence.slice(prime.length);
	
}

function train (sentence) {
	
	recordBackprop = true;
	backprop = [];
	
	var loss = 0;
	var previous = {};
	var forward = {};
	
	for (var a = 0; a < sentence.length - 1; a++) {
		
		var letter = letterToIndex[sentence.charAt(a)];
		var nextLetter = letterToIndex[sentence.charAt(a + 1)];
		
		forward = forwardLSTM(letter, previous);
		previous = forward;
		
		var probabilities = softmax(forward.o);
		
		loss -= Math.log(probabilities.w[nextLetter]);
		
		forward.o.dw = probabilities.w;
		forward.o.dw[nextLetter] -= 1;
		
	}
	
	backward();
	
	updateWeights();
	
	return loss;
	
}

function forwardRNN (letter, previous) {
	
	var observation = Matrix.rowPluck(model["Wil"], letter);
	var hiddenPrevious = {};
	
	if (previous.h) {
		
		hiddenPrevious = previous.h;
		
	} else {
		
		for (var a = 1; a < layers.length - 1; a++) {
			
			hiddenPrevious[a] = new Matrix(layers[a], 1);
			
		}
		
	}
	
	var hidden = [];
	
	for (var a = 1; a < layers.length - 1; a++) {
		
		var input = a == 1 ? observation : hidden[a - 1];
		
		var h0 = Matrix.multiply(model["Wxh" + a], input);
		var h1 = Matrix.multiply(model["Whh" + a], hiddenPrevious[a]);
		var hiddenValue = Matrix.rectifier(Matrix.add(Matrix.add(h0, h1), model["bhh" + a]));
		
		hidden.push(hiddenValue);
		
	}
	
	var output = Matrix.add(Matrix.multiply(model["Whd"], hidden[hidden.length - 1]), model["bd"]);
	
	return {"h":hidden, "o":output};
	
}

function forwardLSTM (letter, previous) {
	
	var observation = Matrix.rowPluck(model["Wil"], letter);
	var hiddenPrevious = {};
	var cellPrevious = {};
	
	if (previous.h) {
		
		hiddenPrevious = previous.h;
		cellPrevious = previous.c;
		
	} else {
		
		for (var a = 1; a < layers.length - 1; a++) {
			
			hiddenPrevious[a] = new Matrix(layers[a], 1);
			cellPrevious[a] = new Matrix(layers[a], 1);
			
		}
		
	}
	
	var hidden = {};
	var cell = {};
	
	for (var a = 1; a < layers.length - 1; a++) {
		
		var input = a == 1 ? observation : hidden[a - 1];
		
		var h0 = Matrix.multiply(model["Wix" + a], input);
		var h1 = Matrix.multiply(model["Wih" + a], hiddenPrevious[a]);
		var inputGate = Matrix.sigmoid(Matrix.add(Matrix.add(h0, h1), model["bi" + a]));
		
		var h2 = Matrix.multiply(model["Wfx" + a], input);
		var h3 = Matrix.multiply(model["Wfh" + a], hiddenPrevious[a]);
		var forgetGate = Matrix.sigmoid(Matrix.add(Matrix.add(h2, h3), model["bf" + a]));
		
		var h4 = Matrix.multiply(model["Wox" + a], input);
		var h5 = Matrix.multiply(model["Woh" + a], hiddenPrevious[a]);
		var outputGate = Matrix.sigmoid(Matrix.add(Matrix.add(h4, h5), model["bo" + a]));
		
		var h6 = Matrix.multiply(model["Wcx" + a], input);
		var h7 = Matrix.multiply(model["Wch" + a], hiddenPrevious[a]);
		var cellWrite = Matrix.hyperbolicTangent(Matrix.add(Matrix.add(h6, h7), model["bc" + a]));
		
		var retain = Matrix.feedlessMultiply(forgetGate, cellPrevious[a]);
		var write = Matrix.feedlessMultiply(inputGate, cellWrite);
		
		var cellValue = Matrix.add(retain, write);
		var hiddenValue = Matrix.feedlessMultiply(outputGate, Matrix.hyperbolicTangent(cellValue));
		
		hidden[a] = hiddenValue;
		cell[a] = cellValue;
		
	}
	
	var output = Matrix.add(Matrix.multiply(model["Whd"], hidden[layers.length - 2]), model["bd"]);
	
	return {"h":hidden, "c":cell, "o":output};
	
}

function initModel (generator) {
	
	model = {"Wil":new Matrix(layers[0], letterEmbedSize).randomise(0, 0.08)};
	
	if (generator == "rnn") {
		
		for (var a = 1; a < layers.length - 1; a++) {
			
			var prevSize = a == 1 ? letterEmbedSize : layers[a - 1];
			
			model["Wxh" + a] = new Matrix(layers[a], prevSize).randomise(0, 0.08);
			model["Whh" + a] = new Matrix(layers[a], layers[a]).randomise(0, 0.08);
			model["bhh" + a] = new Matrix(layers[a], 1);
			
		}
		
		model["Whd"] = new Matrix(layers[layers.length - 1], layers[layers.length - 2]).randomise(0, 0.08);
		model["bd"] = new Matrix(layers[layers.length - 1], 1);
		
	} else if (generator == "lstm") {
		
		for (var a = 1; a < layers.length - 1; a++) {
			
			var prevSize = a == 1 ? letterEmbedSize : layers[a - 1];
			
			model['Wix' + a] = new Matrix(layers[a], prevSize).randomise(0, 0.08);
			model['Wih' + a] = new Matrix(layers[a], layers[a]).randomise(0, 0.08);
			model['bi' + a] = new Matrix(layers[a], 1);
			
			model['Wfx' + a] = new Matrix(layers[a], prevSize).randomise(0, 0.08);
			model['Wfh' + a] = new Matrix(layers[a], layers[a]).randomise(0, 0.08);
			model['bf' + a] = new Matrix(layers[a], 1);
			
			model['Wox' + a] = new Matrix(layers[a], prevSize).randomise(0, 0.08);
			model['Woh' + a] = new Matrix(layers[a], layers[a]).randomise(0, 0.08);
			model['bo' + a] = new Matrix(layers[a], 1);
			
			model['Wcx' + a] = new Matrix(layers[a], prevSize).randomise(0, 0.08);
			model['Wch' + a] = new Matrix(layers[a], layers[a]).randomise(0, 0.08);
			model['bc' + a] = new Matrix(layers[a], 1);
			
		}
		
		model["Whd"] = new Matrix(layers[layers.length - 1], layers[layers.length - 2]).randomise(0, 0.08);
		model["bd"] = new Matrix(layers[layers.length - 1], 1);
		
	}
	
}

function softmax (ma) {
	
	var out = new Matrix(ma.n, ma.d);
	var max = -1e10;
	var sum = 0;
	
	for (var a = 0; a < ma.w.length; a++) {
		
		if (ma.w[a] > max) max = ma.w[a];
		
	}
	
	for (var a = 0; a < ma.w.length; a++) {
		
		out.w[a] = Math.exp(ma.w[a] - max);
		
		sum += out.w[a];
		
	}
	
	for (var a = 0; a < ma.w.length; a++) {
		
		out.w[a] /= sum;
		
	}
	
	return out;
	
}

function sampler (w) {
	
	var random = Math.random();
	var sum = 0;
	
	for (var a = 0; a < w.length; a++) {
		
		sum += w[a];
		
		if (sum > random) return a;
		
	}
	
	return a.length - 1;
	
}

Stecy.setup = function () {
	
	Art.title = "Silicitect";
	
};

Art.ready = function () {
	
	Stecy.loadFile("input/simple.txt", init);
	
	Art.doStyle(0, "whiteSpace", "pre", "font", "20px monospace", "tabSize", "6");
	
};

(function () {
	
	Matrix = function (n, d) {
		
		this.n = n;
		this.d = d;
		this.w = [];
		this.dw = [];
		
		for (var a = 0; a < n * d; a++) {
			
			this.w[a] = 0;
			this.dw[a] = 0;
			
		}
		
	};
	
	Matrix.prototype.randomise = function (base, range) {
		
		for (var a = 0; a < this.n * this.d; a++) {
			
			this.w[a] = base + range * Math.random();
			
		}
		
		return this;
		
	};
	
	
	Matrix.multiply = function (ma, mb) {
		
		if (ma.d != mb.n) throw new Error("wrong dimensions");
		
		var out = new Matrix(ma.n, mb.d);
		
		for (var a = 0; a < ma.n; a++) {
			
			for (var b = 0; b < mb.d; b++) {
				
				out.w[mb.d * a + b] = 0;
				
				for (var c = 0; c < ma.d; c++) {
					
					out.w[mb.d * a + b] += ma.w[ma.d * a + c] * mb.w[mb.d * c + b];
					
				}
				
			}
			
		}
		
		if (recordBackprop) backprop.push(Matrix.multiplyBackward, [ma, mb, out]);
		
		return out;
		
	};
	
	Matrix.multiplyBackward = function (ma, mb, out) {
		
		for (var a = 0; a < ma.n; a++) {
			
			for (var b = 0; b < mb.d; b++) {
				
				for (var c = 0; c < ma.d; c++) {
					
					ma.dw[ma.d * a + c] += mb.w[mb.d * c + b] * out.dw[mb.d * a + b];
					mb.dw[mb.d * c + b] += ma.w[ma.d * a + c] * out.dw[mb.d * a + b];
					
				}
				
			}
			
		}
		
	};
	
	Matrix.feedlessMultiply = function (ma, mb) {
		
		var out = new Matrix(ma.n, ma.d);
		
		for (var a = 0; a < ma.w.length; a++) {
			
			out.w[a] = ma.w[a] * mb.w[a];
			
		}
		
		if (recordBackprop) backprop.push(Matrix.feedlessMultiplyBackward, [ma, mb, out]);
		
		return out;
		
	};
	
	Matrix.feedlessMultiplyBackward = function (ma, mb, out) {
		
		for (var a = 0; a < ma.w.length; a++) {
			
			ma.dw[a] += mb.w[a] * out.dw[a];
			mb.dw[a] += ma.w[a] * out.dw[a];
			
		}
		
	};
	
	Matrix.add = function (ma, mb) {
		
		var out = new Matrix(ma.n, ma.d);
		
		for (var a = 0; a < ma.w.length; a++) {
			
			out.w[a] = ma.w[a] + mb.w[a];
			
		}
		
		if (recordBackprop) backprop.push(Matrix.addBackward, [ma, mb, out]);
		
		return out;
		
	};
	
	Matrix.addBackward = function (ma, mb, out) {
		
		for (var a = 0; a < ma.w.length; a++) {
			
			ma.dw[a] += out.dw[a];
			mb.dw[a] += out.dw[a];
			
		}
		
	};
	
	Matrix.sigmoid = function (ma) {
		
		var out = new Matrix(ma.n, ma.d);
		
		for (var a = 0; a < ma.w.length; a++) {
			
			out.w[a] = 1 / (1 + Math.exp(-ma.w[a]));
			
		}
		
		if (recordBackprop) backprop.push(Matrix.sigmoidBackward, [ma, out]);
		
		return out;
		
	};
	
	Matrix.sigmoidBackward = function (ma, out) {
		
		for (var a = 0; a < ma.w.length; a++) {
			
			ma.dw[a] += out.w[a] * (1 - out.w[a]) * out.dw[a];
			
		}
		
	};
	
	Matrix.rectifier = function (ma) {
		
		var out = new Matrix(ma.n, ma.d);
		
		for (var a = 0; a < ma.w.length; a++) {
			
			out.w[a] = Math.max(0, ma.w[a]);
			
		}
		
		if (recordBackprop) backprop.push(Matrix.rectifierBackward, [ma, out]);
		
		return out;
		
	};
	
	Matrix.rectifierBackward = function (ma, out) {
		
		for (var a = 0; a < ma.w.length; a++) {
			
			ma.dw[a] += ma.w[a] > 0 ? out.dw[a] : 0;
			
		}
		
	};
	
	Matrix.hyperbolicTangent = function (ma) {
		
		var out = new Matrix(ma.n, ma.d);
		
		for (var a = 0; a < ma.w.length; a++) {
			
			out.w[a] = Math.tanh(ma.w[a]);
			
		}
		
		if (recordBackprop) backprop.push(Matrix.hyperbolicTangentBackward, [ma, out]);
		
		return out;
		
	};
	
	Matrix.hyperbolicTangentBackward = function (ma, out) {
		
		for (var a = 0; a < ma.w.length; a++) {
			
			ma.dw[a] += (1 - out.w[a] * out.w[a]) * out.dw[a];
			
		}
		
	};
	
	Matrix.rowPluck = function (ma, row) {
		
		var out = new Matrix(ma.d, 1);
		
		for (var a = 0; a < ma.d; a++) {
			
			out.w[a] = ma.w[ma.d * row + a];
			
		}
		
		if (recordBackprop) backprop.push(Matrix.rowPluckBackward, [ma, out, row]);
		
		return out;
		
	};
	
	Matrix.rowPluckBackward = function (ma, out, row) {
		
		for (var a = 0; a < ma.d; a++) {
			
			ma.dw[ma.d * row + a] += out.dw[a];
			
		}
		
	}
	
})();

function backward () {
	
	for (var a = backprop.length - 1; a > -1; a -= 2) {
		
		if (backprop[a].length == 1) backprop[a - 1](backprop[a][0]);
		if (backprop[a].length == 2) backprop[a - 1](backprop[a][0], backprop[a][1]);
		if (backprop[a].length == 3) backprop[a - 1](backprop[a][0], backprop[a][1], backprop[a][2]);
		
	}
	
}