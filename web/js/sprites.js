/* Knightwatch: the small letter sprites. Each row is a string, each letter a colour of the coarse
   palette in draw.js, and a full stop is clear. */
(function (KW) {
  'use strict';
  KW.sprites = {
    DRUM: ['..NNN...','.NNNNN..','.NNNNN..','.nNNNn..','..nnWW..','....WW.W','.....WW.','....W.W.'],
    EXCL: ['RRR','RRR','RRR','RRR','RRR','.R.','...','RRR','RRR'],
    QUES: ['.YYYY.','YY..YY','....YY','...YY.','..YY..','..YY..','......','..YY..','..YY..'],
    STAR: ['.Y.','YWY','.Y.'],
    HEART: ['P.P','PPP','PPP','.P.'],
    Z3: ['WWW','.W.','WWW'], Z4: ['WWWW','..W.','.W..','WWWW'], Z5: ['WWWWW','...W.','..W..','.W...','WWWWW'],
    GOBLIN: ['l..........l','ll.LLLLLL.ll','.lLLLLLLLLl.','..LWELLWEL..','..LLLLLLLL..','..LEWEWEWL..','..LLEEEELL..','...LLLLLL...'],
    FLY: [['W...W','.ddd.','..d..'], ['.....','WdddW','..d..']],
    POOF: ['Y..Y..Y','.Y.Y.Y.','..YWY..','YYWWWYY','..YWY..','.Y.Y.Y.','Y..Y..Y'],
    CRATE: ['nnnnnnnnnnnn','nNNnNNNNnNNn','nNnNNNNNNnNn','nnNNNNNNNNnn','nNNNNGGNNNNn','nNNNNGGNNNNn','nnNNNNNNNNnn','nNnNNNNNNnNn','nNNnNNNNnNNn','nnnnnnnnnnnn'],
    CHUTE: ['....WWRRWWRRWW....','..WWWWRRWWRRWWWW..','.RRWWWRRWWRRWWWRR.','RRRWWWRRWWRRWWWRRR','d................d','.d..............d.','..d............d..','...d..........d...'],
    MOON: ['..YYYY....','.YYY......','YYY.......','YYY.......','YYY.......','YYYY......','.YYYY...Y.','..YYYYYY..','....YY....'],
    FLAME: [['..Y...','.YY...','.YGY..','YGGY..','YGRGY.','.GRG..'], ['...Y..','..YY..','.YGY..','.YGGY.','YGRGY.','.GRG..']],
    PIE: ['...RrRRrRR..','..RPRRPRRrR.','.GGgGGgGGgGG','GGGGGGGGGGGG','.dssssssssd.'],
    PLATE: ['............','............','............','...g...G.g..','.dssssssssd.'],
    HELM: ['.....RR.....','....RRRR....','..KKKKKKKK..','.KSSSSSSSsK.','KSSSSSSSSssK','KSSKKKKKKssK','KSKKKKKKKKsK','KSKKKKKKKKsK','KSSKKKKKKssK','.KssssssssK.','..KKKKKKKK..'],
    SPEECH: ['.WWWWWWWWWWWW.','WWWWWWWWWWWWWW','WWWWWWWWWWWWWW','WWWWWWWWWWWWWW','WWWWWWWWWWWWWW','.WWWWWWWWWWWW.','...WW.........','..WW..........']
  };
})(window.KW);
