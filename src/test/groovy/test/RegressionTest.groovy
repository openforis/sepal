package test

import weka.classifiers.Classifier
import weka.classifiers.Evaluation
import weka.classifiers.functions.LibSVM
import weka.classifiers.trees.M5P
import weka.core.Instance
import weka.core.Instances
import weka.core.converters.AbstractFileLoader
import weka.core.converters.ArffLoader

import javax.swing.BorderFactory
import javax.swing.JFrame
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingUtilities
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Dimension
import java.awt.Graphics

class RegressionTest {

    public static void main(String[] args) {

//        def classifier = new LibSVM()
//        classifier.setOptions('-S 3 -K 2 -D 3 -G 0.0 -R 0.0 -N 0.5 -M 40.0 -C 1.0 -E 0.001 -P 0.1'.split(' '))
//        classifyAndTest('dbh-height-small', 'dbh-height-small', classifier)

//        classifyAndTest('dbh-height-small', 'dbh-height-small', new M5P())

        SwingUtilities.invokeLater(new Runnable() {
            public void run() {
                createAndShowGUI();
            }
        });
    }

    private static void createAndShowGUI() {
        JFrame f = new JFrame("Regression test");
        f.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        f.add(new MyPanel());
        f.pack();
        f.setVisible(true);
    }

    static class MyPanel extends JPanel {

        public MyPanel() {
            setBorder(BorderFactory.createLineBorder(Color.black));
        }

        public Dimension getPreferredSize() {
            return new Dimension(2000,1000);
        }

        public void paintComponent(Graphics g) {
            super.paintComponent(g);

            // Draw Text
            g.drawString("This is my custom Panel!",10,20);

            g.setColor(Color.RED);
            g.fillRect(10, 20, 20, 30);
            g.setColor(Color.BLACK);
            g.drawRect(10, 20, 20, 30);
        }
    }

    static void classifyAndTest(String trainingDataName, String testDataName, Classifier classifier) {
        Instances trainingData = loadDataSet(trainingDataName)
        trainingData.setClassIndex(trainingData.numAttributes() - 1);

        Instances testData = loadDataSet(testDataName)
        testData.setClassIndex(trainingData.numAttributes() - 1);

        classifier.buildClassifier(trainingData)

        def evaluation = new Evaluation(testData)
        evaluation.evaluateModel(classifier, testData);

        def en = testData.enumerateInstances()
        while (en.hasMoreElements()) {
            Instance inst = en.nextElement() as Instance
            def dbh = inst.value(0)
            def height = inst.value(1)
            def predictedHeight = evaluation.evaluateModelOnce(classifier, inst)
            def error = evaluation.rootMeanSquaredError()
            println "$dbh, $height, $predictedHeight, ${predictedHeight + error}, ${predictedHeight - error}"
        }
    }

    private static Instances loadDataSet(name) {
        AbstractFileLoader loader = new ArffLoader();
        loader.setFile(new File("/Users/wiell/Downloads/outlier/${name}.arff"));
        Instances dataSet = loader.getDataSet();
        dataSet
    }
}
